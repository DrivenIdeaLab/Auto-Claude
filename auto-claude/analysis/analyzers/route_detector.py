"""
Route Detector Module
=====================

Detects API routes and endpoints across different frameworks:
- Python: FastAPI, Flask, Django
- Node.js: Express, Next.js
- Go: Gin, Echo, Chi, Fiber
- Rust: Axum, Actix
"""

import os
import re
from pathlib import Path
from typing import Dict, List, Set

from .base import BaseAnalyzer


class RouteDetector(BaseAnalyzer):
    """Detects API routes across multiple web frameworks."""

    # Directories to exclude from route detection
    EXCLUDED_DIRS = {"node_modules", ".venv", "venv", "__pycache__", ".git"}

    def __init__(self, path: Path):
        super().__init__(path)
        self._files_by_ext: Dict[str, List[Path]] | None = None

    @property
    def files_by_ext(self) -> Dict[str, List[Path]]:
        """Lazy-loaded cache of files by extension."""
        if self._files_by_ext is None:
            self._scan_project_files()
        # MyPy help: _scan_project_files ensures it is not None
        assert self._files_by_ext is not None
        return self._files_by_ext

    def _should_include_file(self, file_path: Path) -> bool:
        """Check if file should be included (not in excluded directories)."""
        return not any(part in self.EXCLUDED_DIRS for part in file_path.parts)

    def _scan_project_files(self):
        """Scan project files once and cache them by extension."""
        self._files_by_ext = {}

        # Initialize lists for common extensions to ensure keys exist
        extensions_of_interest = {
            '.py',
            '.js', '.ts', '.jsx', '.tsx',
            '.go',
            '.rs'
        }

        # Walk the directory tree
        for root, dirs, files in os.walk(self.path):
            # Modify dirs in-place to skip excluded directories
            # This prevents traversing into node_modules, .venv, etc.
            dirs[:] = [d for d in dirs if d not in self.EXCLUDED_DIRS]

            root_path = Path(root)

            for file in files:
                file_path = root_path / file
                suffix = file_path.suffix

                if suffix in extensions_of_interest:
                    if suffix not in self._files_by_ext:
                        self._files_by_ext[suffix] = []
                    self._files_by_ext[suffix].append(file_path)

    def detect_all_routes(self) -> list[dict]:
        """Detect all API routes across different frameworks."""
        routes = []

        # Python FastAPI
        routes.extend(self._detect_fastapi_routes())

        # Python Flask
        routes.extend(self._detect_flask_routes())

        # Python Django
        routes.extend(self._detect_django_routes())

        # Node.js Express/Fastify/Koa
        routes.extend(self._detect_express_routes())

        # Next.js (file-based routing)
        routes.extend(self._detect_nextjs_routes())

        # Go Gin/Echo/Chi
        routes.extend(self._detect_go_routes())

        # Rust Axum/Actix
        routes.extend(self._detect_rust_routes())

        return routes

    def _detect_fastapi_routes(self) -> list[dict]:
        """Detect FastAPI routes."""
        routes = []
        files_to_check = self.files_by_ext.get('.py', [])

        for file_path in files_to_check:
            try:
                content = file_path.read_text()
            except (OSError, UnicodeDecodeError):
                continue

            # Pattern: @app.get("/path") or @router.post("/path", dependencies=[...])
            patterns = [
                (
                    r'@(?:app|router)\.(get|post|put|delete|patch)\(["\']([^"\']+)["\']',
                    "decorator",
                ),
                (
                    r'@(?:app|router)\.api_route\(["\']([^"\']+)["\'][^)]*methods\s*=\s*\[([^\]]+)\]',
                    "api_route",
                ),
            ]

            for pattern, pattern_type in patterns:
                matches = re.finditer(pattern, content, re.MULTILINE)
                for match in matches:
                    if pattern_type == "decorator":
                        method = match.group(1).upper()
                        path = match.group(2)
                        methods = [method]
                    else:
                        path = match.group(1)
                        methods_str = match.group(2)
                        methods = [
                            m.strip().strip('"').strip("'").upper()
                            for m in methods_str.split(",")
                        ]

                    # Check if route requires auth (has Depends in the decorator)
                    line_start = content.rfind("\n", 0, match.start()) + 1
                    line_end = content.find("\n", match.end())
                    route_definition = content[
                        line_start : line_end if line_end != -1 else len(content)
                    ]

                    requires_auth = (
                        "Depends" in route_definition
                        or "require" in route_definition.lower()
                    )

                    routes.append(
                        {
                            "path": path,
                            "methods": methods,
                            "file": str(file_path.relative_to(self.path)),
                            "framework": "FastAPI",
                            "requires_auth": requires_auth,
                        }
                    )

        return routes

    def _detect_flask_routes(self) -> list[dict]:
        """Detect Flask routes."""
        routes = []
        files_to_check = self.files_by_ext.get('.py', [])

        for file_path in files_to_check:
            try:
                content = file_path.read_text()
            except (OSError, UnicodeDecodeError):
                continue

            # Pattern: @app.route("/path", methods=["GET", "POST"])
            pattern = r'@(?:app|bp|blueprint)\.route\(["\']([^"\']+)["\'](?:[^)]*methods\s*=\s*\[([^\]]+)\])?'
            matches = re.finditer(pattern, content, re.MULTILINE)

            for match in matches:
                path = match.group(1)
                methods_str = match.group(2)

                if methods_str:
                    methods = [
                        m.strip().strip('"').strip("'").upper()
                        for m in methods_str.split(",")
                    ]
                else:
                    methods = ["GET"]  # Flask default

                # Check for @login_required decorator
                decorator_start = content.rfind("@", 0, match.start())
                decorator_section = content[decorator_start : match.end()]
                requires_auth = (
                    "login_required" in decorator_section
                    or "require" in decorator_section.lower()
                )

                routes.append(
                    {
                        "path": path,
                        "methods": methods,
                        "file": str(file_path.relative_to(self.path)),
                        "framework": "Flask",
                        "requires_auth": requires_auth,
                    }
                )

        return routes

    def _detect_django_routes(self) -> list[dict]:
        """Detect Django routes from urls.py files."""
        routes = []
        # Filter python files for urls.py
        all_py_files = self.files_by_ext.get('.py', [])
        url_files = [f for f in all_py_files if f.name == "urls.py"]

        for file_path in url_files:
            try:
                content = file_path.read_text()
            except (OSError, UnicodeDecodeError):
                continue

            # Pattern: path('users/<int:id>/', views.user_detail)
            patterns = [
                r'path\(["\']([^"\']+)["\']',
                r're_path\([r]?["\']([^"\']+)["\']',
            ]

            for pattern in patterns:
                matches = re.finditer(pattern, content)
                for match in matches:
                    path = match.group(1)

                    routes.append(
                        {
                            "path": f"/{path}" if not path.startswith("/") else path,
                            "methods": ["GET", "POST"],  # Django allows both by default
                            "file": str(file_path.relative_to(self.path)),
                            "framework": "Django",
                            "requires_auth": False,  # Can't easily detect without middleware analysis
                        }
                    )

        return routes

    def _detect_express_routes(self) -> list[dict]:
        """Detect Express/Fastify/Koa routes."""
        routes = []
        js_files = self.files_by_ext.get('.js', [])
        ts_files = self.files_by_ext.get('.ts', [])
        files_to_check = js_files + ts_files

        for file_path in files_to_check:
            try:
                content = file_path.read_text()
            except (OSError, UnicodeDecodeError):
                continue

            # Pattern: app.get('/path', handler) or router.post('/path', middleware, handler)
            pattern = (
                r'(?:app|router)\.(get|post|put|delete|patch|use)\(["\']([^"\']+)["\']'
            )
            matches = re.finditer(pattern, content)

            for match in matches:
                method = match.group(1).upper()
                path = match.group(2)

                if method == "USE":
                    # .use() is middleware, might be a route prefix
                    continue

                # Check for auth middleware in the route definition
                line_start = content.rfind("\n", 0, match.start()) + 1
                line_end = content.find("\n", match.end())
                route_line = content[
                    line_start : line_end if line_end != -1 else len(content)
                ]

                requires_auth = any(
                    keyword in route_line.lower()
                    for keyword in ["auth", "authenticate", "protect", "require"]
                )

                routes.append(
                    {
                        "path": path,
                        "methods": [method],
                        "file": str(file_path.relative_to(self.path)),
                        "framework": "Express",
                        "requires_auth": requires_auth,
                    }
                )

        return routes

    def _is_relative_to(self, path: Path, base: Path) -> bool:
        """Helper to check if path is relative to base (compatible with Python < 3.9)."""
        try:
            path.relative_to(base)
            return True
        except ValueError:
            return False

    def _detect_nextjs_routes(self) -> list[dict]:
        """Detect Next.js file-based routes."""
        routes = []

        # Collect candidates
        candidates = []
        for ext in ['.ts', '.js', '.tsx', '.jsx']:
            candidates.extend(self.files_by_ext.get(ext, []))

        # Next.js App Router (app directory)
        app_dir = self.path / "app"
        # Next.js Pages Router (pages/api directory)
        pages_api = self.path / "pages" / "api"

        has_app_dir = app_dir.exists()
        has_pages_api = pages_api.exists()

        if not (has_app_dir or has_pages_api):
            return routes

        for route_file in candidates:
            # Check for App Router
            if has_app_dir and self._is_relative_to(route_file, app_dir):
                # Must be route.{ts,js,tsx,jsx}
                if not route_file.name.startswith("route."):
                    continue

                # Convert file path to route path
                # app/api/users/[id]/route.ts -> /api/users/:id
                relative_path = route_file.parent.relative_to(app_dir)
                route_path = "/" + str(relative_path).replace("\\", "/")

                # Convert [id] to :id
                route_path = re.sub(r"\[([^\]]+)\]", r":\1", route_path)

                try:
                    content = route_file.read_text()
                    # Detect exported methods: export async function GET(request)
                    methods = re.findall(
                        r"export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)",
                        content,
                    )

                    if methods:
                        routes.append(
                            {
                                "path": route_path,
                                "methods": methods,
                                "file": str(route_file.relative_to(self.path)),
                                "framework": "Next.js",
                                "requires_auth": "auth" in content.lower(),
                            }
                        )
                except (OSError, UnicodeDecodeError):
                    continue

            # Check for Pages Router
            elif has_pages_api and self._is_relative_to(route_file, pages_api):
                if route_file.name.startswith("_"):
                    continue

                # Convert file path to route
                relative_path = route_file.relative_to(pages_api)
                route_path = "/api/" + str(relative_path.with_suffix("")).replace(
                    "\\", "/"
                )

                # Convert [id] to :id
                route_path = re.sub(r"\[([^\]]+)\]", r":\1", route_path)

                routes.append(
                    {
                        "path": route_path,
                        "methods": [
                            "GET",
                            "POST",
                        ],  # Next.js API routes handle all methods
                        "file": str(route_file.relative_to(self.path)),
                        "framework": "Next.js",
                        "requires_auth": False,
                    }
                )

        return routes

    def _detect_go_routes(self) -> list[dict]:
        """Detect Go framework routes (Gin, Echo, Chi, Fiber)."""
        routes = []
        go_files = self.files_by_ext.get('.go', [])

        for file_path in go_files:
            try:
                content = file_path.read_text()
            except (OSError, UnicodeDecodeError):
                continue

            # Gin: r.GET("/path", handler)
            # Echo: e.POST("/path", handler)
            # Chi: r.Get("/path", handler)
            # Fiber: app.Get("/path", handler)
            pattern = r'(?:r|e|app|router)\.(GET|POST|PUT|DELETE|PATCH|Get|Post|Put|Delete|Patch)\(["\']([^"\']+)["\']'
            matches = re.finditer(pattern, content)

            for match in matches:
                method = match.group(1).upper()
                path = match.group(2)

                routes.append(
                    {
                        "path": path,
                        "methods": [method],
                        "file": str(file_path.relative_to(self.path)),
                        "framework": "Go",
                        "requires_auth": False,
                    }
                )

        return routes

    def _detect_rust_routes(self) -> list[dict]:
        """Detect Rust framework routes (Axum, Actix)."""
        routes = []
        rust_files = self.files_by_ext.get('.rs', [])

        for file_path in rust_files:
            try:
                content = file_path.read_text()
            except (OSError, UnicodeDecodeError):
                continue

            # Axum: .route("/path", get(handler))
            # Actix: web::get().to(handler)
            patterns = [
                r'\.route\(["\']([^"\']+)["\'],\s*(get|post|put|delete|patch)',
                r"web::(get|post|put|delete|patch)\(\)",
            ]

            for pattern in patterns:
                matches = re.finditer(pattern, content)
                for match in matches:
                    if len(match.groups()) == 2:
                        path = match.group(1)
                        method = match.group(2).upper()
                    else:
                        path = "/"  # Can't determine path from web:: syntax
                        method = match.group(1).upper()

                    routes.append(
                        {
                            "path": path,
                            "methods": [method],
                            "file": str(file_path.relative_to(self.path)),
                            "framework": "Rust",
                            "requires_auth": False,
                        }
                    )

        return routes

import { app, BrowserWindow, shell, nativeImage } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { setupIpcHandlers } from './ipc-setup';
import { AgentManager } from './agent';
import { TerminalManager } from './terminal-manager';
import { pythonEnvManager } from './python-env-manager';
import { getUsageMonitor } from './claude-profile/usage-monitor';
import { initializeUsageMonitorForwarding } from './ipc-handlers/terminal-handlers';
import { initializeAppUpdater } from './app-updater';
import { validateEnvironment, showValidationDialog, logValidationResults } from './env-validator';
import type { EnvValidationResult } from './env-validator';
import { existsSync, readFileSync } from 'fs';
import type { AppSettings } from '../shared/types';

// Get icon path based on platform
function getIconPath(): string {
  // In dev mode, __dirname is out/main, so we go up to project root then into resources
  // In production, resources are in the app's resources folder
  const resourcesPath = is.dev
    ? join(__dirname, '../../resources')
    : join(process.resourcesPath);

  let iconName: string;
  if (process.platform === 'darwin') {
    // Use PNG in dev mode (works better), ICNS in production
    iconName = is.dev ? 'icon-256.png' : 'icon.icns';
  } else if (process.platform === 'win32') {
    iconName = 'icon.ico';
  } else {
    iconName = 'icon.png';
  }

  const iconPath = join(resourcesPath, iconName);
  return iconPath;
}

// Keep a global reference of the window object to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
let agentManager: AgentManager | null = null;
let terminalManager: TerminalManager | null = null;
let envValidationResult: EnvValidationResult | null = null;

function createWindow(): void {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 },
    icon: getIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false // Prevent terminal lag when window loses focus
    }
  });

  // Show window when ready to avoid visual flash
  mainWindow.on('ready-to-show', async () => {
    mainWindow?.show();

    // Show validation dialog if there are issues (after a short delay to let window render)
    if (envValidationResult && (
      envValidationResult.issues.some(i => i.severity === 'critical' || i.severity === 'warning')
    )) {
      setTimeout(async () => {
        await showValidationDialog(envValidationResult!, mainWindow);

        // If critical errors prevent startup, optionally quit (or let user proceed to settings)
        if (!envValidationResult!.canStart) {
          console.error('[main] Critical validation errors - app may not function correctly');
          // Note: We don't quit automatically - let user access settings to fix issues
        }
      }, 1000);
    }
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Open DevTools in development
  if (is.dev) {
    mainWindow.webContents.openDevTools({ mode: 'right' });
  }

  // Clean up on close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Set app name before ready (for dock tooltip on macOS in dev mode)
app.setName('Auto Claude');
if (process.platform === 'darwin') {
  // Force the name to appear in dock on macOS
  app.name = 'Auto Claude';
}

// Initialize the application
app.whenReady().then(async () => {
  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.autoclaude.ui');

  // Set dock icon on macOS
  if (process.platform === 'darwin') {
    const iconPath = getIconPath();
    try {
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        app.dock?.setIcon(icon);
      }
    } catch (e) {
      console.warn('Could not set dock icon:', e);
    }
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Initialize agent manager
  agentManager = new AgentManager();

  // Initialize terminal manager
  terminalManager = new TerminalManager(() => mainWindow);

  // Setup IPC handlers (pass pythonEnvManager for Python path management and validation result getter)
  setupIpcHandlers(
    agentManager,
    terminalManager,
    () => mainWindow,
    pythonEnvManager,
    () => envValidationResult
  );

  // Load settings to get autoBuildPath
  const settingsPath = join(app.getPath('userData'), 'settings.json');
  let autoBuildPath: string | undefined;
  if (existsSync(settingsPath)) {
    try {
      const settingsContent = readFileSync(settingsPath, 'utf-8');
      const settings: AppSettings = JSON.parse(settingsContent);
      autoBuildPath = settings.autoBuildPath;
    } catch (error) {
      console.warn('[main] Failed to load settings for validation:', error);
    }
  }

  // Validate environment before creating window
  console.warn('[main] Running environment validation...');
  envValidationResult = await validateEnvironment(autoBuildPath);
  logValidationResults(envValidationResult);

  // Create window
  createWindow();

  // Initialize usage monitoring after window is created
  if (mainWindow) {
    // Setup event forwarding from usage monitor to renderer
    initializeUsageMonitorForwarding(mainWindow);

    // Start the usage monitor
    const usageMonitor = getUsageMonitor();
    usageMonitor.start();
    console.warn('[main] Usage monitor initialized and started');

    // Log debug mode status
    const isDebugMode = process.env.DEBUG === 'true';
    if (isDebugMode) {
      console.warn('[main] ========================================');
      console.warn('[main] DEBUG MODE ENABLED (DEBUG=true)');
      console.warn('[main] ========================================');
    }

    // Initialize app auto-updater (only in production, or when DEBUG_UPDATER is set)
    const forceUpdater = process.env.DEBUG_UPDATER === 'true';
    if (app.isPackaged || forceUpdater) {
      initializeAppUpdater(mainWindow);
      console.warn('[main] App auto-updater initialized');
      if (forceUpdater && !app.isPackaged) {
        console.warn('[main] Updater forced in dev mode via DEBUG_UPDATER=true');
        console.warn('[main] Note: Updates won\'t actually work in dev mode');
      }
    } else {
      console.warn('[main] ========================================');
      console.warn('[main] App auto-updater DISABLED (development mode)');
      console.warn('[main] To test updater logging, set DEBUG_UPDATER=true');
      console.warn('[main] Note: Actual updates only work in packaged builds');
      console.warn('[main] ========================================');
    }
  }

  // macOS: re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Cleanup before quit
app.on('before-quit', async () => {
  // Stop usage monitor
  const usageMonitor = getUsageMonitor();
  usageMonitor.stop();
  console.warn('[main] Usage monitor stopped');

  // Kill all running agent processes
  if (agentManager) {
    await agentManager.killAll();
  }
  // Kill all terminal processes
  if (terminalManager) {
    await terminalManager.killAll();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

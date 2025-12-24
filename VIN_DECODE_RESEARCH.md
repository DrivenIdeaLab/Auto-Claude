# VIN Decode API Research - Australian Market
## WorkshopOS Implementation Research

**Research Date:** 2025-12-22
**Status:** PRELIMINARY - Requires validation with live web search
**Purpose:** Identify best VIN decode solution for Australian automotive workshops

---

## Executive Summary

This research evaluates VIN decode API options for WorkshopOS, targeting the Australian automotive market with specific focus on:
- Traditional Australian fleet (Toyota, Ford, Holden, Hyundai)
- Growing Chinese EV segment (BYD, MG, NIO, Great Wall)
- SMB pricing constraints (<$0.10 per lookup target)
- Australian/NZ timezone support

**Note:** This report requires validation through web research. The following sections outline known providers and evaluation criteria.

---

## Known VIN Decode Providers (To Be Validated)

### Option 1: SUNCARS / AUSCAR
**Provider:** Australian-based automotive data provider
**URL:** [Requires research]
**Market Focus:** Australian market specialist

**Expected Strengths:**
- Local Australian vehicle database
- Strong coverage of Australian-delivered vehicles
- Likely good coverage of common brands (Toyota, Ford, Holden, Hyundai, Mazda)
- May have Australian compliance data (ADRs)

**Questions to Research:**
- [ ] Current API availability and pricing
- [ ] Chinese EV coverage (BYD, MG, NIO, Great Wall)
- [ ] Per-lookup cost vs subscription model
- [ ] Data fields available (make, model, variant, engine, transmission, ADAS)
- [ ] SLA and uptime guarantees
- [ ] API documentation quality
- [ ] Development/sandbox environment
- [ ] Support hours (AU/NZ timezone)

**Expected Pricing:** $X per lookup or $Y/month subscription

---

### Option 2: VINLookup / VIN-Decoder.net
**Provider:** International VIN decode service
**URL:** https://www.vindecoder.net / https://www.vinlookup.com
**Market Focus:** Global coverage

**Expected Strengths:**
- International vehicle database
- Wide brand coverage including imports
- Likely API available
- May have free tier for development

**Questions to Research:**
- [ ] Australian vehicle coverage percentage
- [ ] Chinese brand coverage (BYD, NIO, Li Auto, XPeng, Great Wall/HAVAL)
- [ ] Pricing model (pay-per-use vs subscription)
- [ ] Data comprehensiveness (engine specs, transmission, fuel type, ADAS)
- [ ] API rate limits
- [ ] Response time / latency from Australia
- [ ] Error handling for unknown VINs
- [ ] Documentation and code examples

**Expected Pricing:** $0.05-$0.15 per lookup

---

### Option 3: NHTSA VIN Decoder (USA)
**Provider:** US National Highway Traffic Safety Administration
**URL:** https://vpic.nhtsa.dot.gov/api/
**Market Focus:** US market (free but limited AU relevance)

**Expected Strengths:**
- Free API
- Comprehensive for US-market vehicles
- Well-documented
- No rate limits

**Expected Weaknesses:**
- Poor Australian market coverage
- No Australian-delivered vehicle data
- Limited usefulness for right-hand drive variants
- No Chinese EV brands

**Use Case:** Development/testing only, not production

---

### Option 4: AutoCheck / Carfax International
**Provider:** Experian AutoCheck or Carfax
**URL:** [Requires research]
**Market Focus:** Global vehicle history

**Expected Strengths:**
- Large international database
- Vehicle history data (not just VIN decode)
- May include Australian vehicles

**Questions to Research:**
- [ ] API availability for VIN decode only (vs full history)
- [ ] Australian coverage
- [ ] Pricing structure
- [ ] Data fields for decode-only queries

**Expected Pricing:** Higher (typically $0.20-$0.50+ per lookup)

---

### Option 5: AASRA / MVIS Integration
**Provider:** Australian Automotive Service & Repair Authority
**URL:** [Requires research - may not have public API]
**Market Focus:** Australian automotive industry data

**Expected Strengths:**
- Official Australian automotive industry data
- High accuracy for Australian-delivered vehicles
- May include service/recall data

**Questions to Research:**
- [ ] Is there a public API?
- [ ] Or only available through automotive software partners?
- [ ] Pricing and access requirements
- [ ] Data licensing restrictions

**Expected Availability:** May require partnership/license agreement

---

### Option 6: VINDecoderz
**Provider:** Commercial VIN decode API
**URL:** https://www.vindecoderz.com
**Market Focus:** Global

**Questions to Research:**
- [ ] Australian coverage
- [ ] Chinese EV support
- [ ] Pricing
- [ ] API quality and documentation

---

### Option 7: DataOne Software / AutoServe1
**Provider:** Automotive software providers with VIN decode
**URL:** [Requires research]
**Market Focus:** Australian workshop management systems

**Questions to Research:**
- [ ] Standalone API availability (vs full software suite)
- [ ] Pricing for API-only access
- [ ] Data coverage

---

### Option 8: RedBook / GlassGuide API
**Provider:** Australian vehicle valuation services
**URL:** [Requires research]
**Market Focus:** Australian vehicle data

**Expected Strengths:**
- Comprehensive Australian vehicle database
- Valuation and specification data
- Strong local market coverage

**Questions to Research:**
- [ ] VIN decode API availability
- [ ] Pricing structure
- [ ] Data fields available
- [ ] Chinese EV coverage

**Expected Pricing:** Likely higher cost (premium data source)

---

## Evaluation Criteria

### 1. Australian Coverage
- **Target:** >90% of vehicles serviced by typical AU workshop
- **Critical brands:** Toyota, Ford, Holden, Hyundai, Mazda, Nissan, Honda, Mitsubishi
- **Growing segment:** Tesla, BYD, MG, NIO, Great Wall/HAVAL
- **Import coverage:** Japanese imports, European brands

### 2. Chinese EV Brands (Priority)
**Must support:**
- BYD (Atto 3, Dolphin, Seal) - largest Chinese brand in AU
- MG Motor (MG4, ZS EV, MG5) - SAIC-owned, high volume
- Great Wall / HAVAL (H6, Jolion) - established presence

**Should support:**
- NIO (ET7, ES8) - premium segment
- Li Auto - emerging
- XPeng - emerging
- Polestar (Volvo/Geely) - growing presence

**Data requirements for EVs:**
- Battery capacity and type
- Electric motor specifications
- Charging capabilities
- ADAS features (critical for EVs)
- Software version (if available)

### 3. Data Fields Required

**Essential:**
- VIN validation
- Make
- Model
- Year / Model year
- Body type (sedan, SUV, wagon, etc.)
- Engine size and type
- Transmission type
- Fuel type (petrol, diesel, electric, hybrid, plug-in hybrid)
- Drive type (FWD, RWD, AWD, 4WD)

**Highly Desired:**
- Variant/trim level
- Build date
- Country of manufacture
- Weight (GVM, tare)
- Seating capacity
- Door count

**Nice to Have:**
- ADAS features (AEB, ACC, LKA, etc.)
- Safety rating (ANCAP)
- Emission standard (Euro 5/6, etc.)
- Paint color
- Standard features
- Recall information

### 4. Pricing Constraints

**Target:** <$0.10 per VIN lookup for sustainable SMB business model

**Scenarios:**
- Small workshop: 50-100 lookups/month = $5-10/month
- Medium workshop: 200-400 lookups/month = $20-40/month
- Large workshop: 500-1000 lookups/month = $50-100/month

**Acceptable Models:**
- Pay-as-you-go with volume discounts
- Monthly subscription with included lookups
- Freemium (free tier for development/testing)

**Unacceptable:**
- >$0.20 per lookup (too expensive for SMB)
- Minimum monthly commitments >$100
- Annual contracts without trial period

### 5. Reliability & Performance

**Requirements:**
- Uptime SLA: >99.5% (ideally 99.9%)
- Response time: <2 seconds (from Australia)
- Rate limits: >100 requests/minute
- Error handling: Clear error messages for unknown VINs
- Retry logic: Transient error handling

**Support:**
- Documentation: Comprehensive API docs with examples
- Timezone: Support or documentation available during AU business hours
- Issue resolution: <24 hour response for critical issues

### 6. Integration Effort

**Low Effort:**
- RESTful API with JSON responses
- Simple authentication (API key)
- Clear documentation
- Code examples in common languages
- Webhook support for async processing (optional)

**Medium Effort:**
- SOAP API (older but functional)
- OAuth authentication
- Less documentation, requires experimentation

**High Effort:**
- Proprietary protocols
- Complex authentication flows
- Poor documentation
- Requires extensive testing

---

## Research Methodology

### Phase 1: Provider Discovery
**Search queries:**
1. "VIN decoder API Australia"
2. "vehicle identification database Australia"
3. "automotive data API Australia workshop"
4. "BYD VIN decode API"
5. "Chinese EV VIN decoder"
6. "SUNCARS API documentation"
7. "AASRA MVIS vehicle data API"
8. "RedBook GlassGuide API"

### Phase 2: Provider Evaluation
For each identified provider:

1. **Access API Documentation**
   - Find developer portal
   - Review API endpoints
   - Check data schema/response format
   - Note authentication method

2. **Verify Australian Coverage**
   - Test with sample Australian VINs
   - Check brand/model coverage claims
   - Verify Chinese EV support with specific examples

3. **Pricing Research**
   - Find public pricing page
   - Contact sales for SMB-specific pricing
   - Calculate cost per lookup
   - Identify any hidden fees

4. **Technical Assessment**
   - Review API quality (REST vs SOAP, response format)
   - Check uptime/status page
   - Read developer reviews/forums
   - Test API response time

5. **Support Evaluation**
   - Check support channels (email, phone, chat)
   - Review documentation completeness
   - Assess responsiveness (submit test inquiry)

### Phase 3: Testing
**Test VIN samples:**

**Australian delivered vehicles:**
- JT2AE82E002123456 (Toyota Corolla)
- 6FPAAAJGXFG123456 (Ford Ranger)
- MAL3V52T5K0123456 (Mazda CX-5)
- KMHSH81XDHU123456 (Hyundai i30)

**Chinese EVs (if available):**
- LGWEF4A51P0123456 (BYD Atto 3) - if sample available
- LSJW74S58N0123456 (MG4 Electric) - if sample available
- [Great Wall/HAVAL sample]
- [NIO sample if available in AU]

**European imports:**
- WBA3A5C50F0123456 (BMW 3 Series)
- WVWZZZAUZLW123456 (Volkswagen Golf)

### Phase 4: Comparison
Create matrix comparing:
- Cost per lookup
- Australian coverage %
- Chinese EV support
- Data completeness
- API quality
- Integration effort
- Reliability/SLA

---

## Comparison Matrix Template

| Criteria | SUNCARS | VINLookup | AutoCheck | AASRA/MVIS | RedBook | Other |
|----------|---------|-----------|-----------|------------|---------|-------|
| **Pricing** |
| Cost per lookup | $? | $? | $? | $? | $? | $? |
| Monthly subscription | $? | $? | $? | $? | $? | $? |
| Free tier | ?/? | ?/? | ?/? | ?/? | ?/? | ?/? |
| Volume discounts | ? | ? | ? | ? | ? | ? |
| **Coverage** |
| AU vehicles % | ?% | ?% | ?% | ?% | ?% | ?% |
| Toyota/Ford/Holden | ? | ? | ? | ? | ? | ? |
| BYD support | ? | ? | ? | ? | ? | ? |
| MG support | ? | ? | ? | ? | ? | ? |
| NIO support | ? | ? | ? | ? | ? | ? |
| Great Wall/HAVAL | ? | ? | ? | ? | ? | ? |
| Japanese imports | ? | ? | ? | ? | ? | ? |
| **Data Fields** |
| Make/Model/Year | ? | ? | ? | ? | ? | ? |
| Engine specs | ? | ? | ? | ? | ? | ? |
| Transmission | ? | ? | ? | ? | ? | ? |
| Fuel type | ? | ? | ? | ? | ? | ? |
| EV battery specs | ? | ? | ? | ? | ? | ? |
| ADAS features | ? | ? | ? | ? | ? | ? |
| Build date | ? | ? | ? | ? | ? | ? |
| Variant/trim | ? | ? | ? | ? | ? | ? |
| **Reliability** |
| Uptime SLA | ?% | ?% | ?% | ?% | ?% | ?% |
| Response time | ?ms | ?ms | ?ms | ?ms | ?ms | ?ms |
| Rate limits | ?/min | ?/min | ?/min | ?/min | ?/min | ?/min |
| **Technical** |
| API type | REST? | REST? | REST? | REST? | REST? | REST? |
| Auth method | ? | ? | ? | ? | ? | ? |
| Documentation | ?/5 | ?/5 | ?/5 | ?/5 | ?/5 | ?/5 |
| Code examples | ? | ? | ? | ? | ? | ? |
| Sandbox/test env | ? | ? | ? | ? | ? | ? |
| **Support** |
| AU timezone | ? | ? | ? | ? | ? | ? |
| Support channels | ? | ? | ? | ? | ? | ? |
| Response SLA | ?hrs | ?hrs | ?hrs | ?hrs | ?hrs | ?hrs |
| **Integration** |
| Effort level | ?/3 | ?/3 | ?/3 | ?/3 | ?/3 | ?/3 |
| Est. dev time | ?hrs | ?hrs | ?hrs | ?hrs | ?hrs | ?hrs |

**Legend:**
- Effort level: 1=Low, 2=Medium, 3=High
- Documentation: 1-5 rating (5=excellent)
- ?=Requires research

---

## Expected Recommendation Framework

### Scenario A: If cost is primary constraint
**If a provider offers <$0.05/lookup with adequate AU coverage:**
- Recommend lowest cost option
- Accept some limitations in data completeness
- Plan for data enrichment from other sources

### Scenario B: If Chinese EV coverage is critical
**If workshop services high % of Chinese EVs:**
- Prioritize providers with confirmed BYD/MG/NIO support
- Willing to pay premium ($0.10-$0.15/lookup)
- Ensure ADAS and battery data available

### Scenario C: If Australian market completeness is critical
**If need comprehensive AU coverage:**
- SUNCARS/AUSCAR likely best choice
- RedBook/GlassGuide as premium option
- Willing to pay for local data quality

### Scenario D: Hybrid approach
**Use multiple providers:**
- Primary: Cost-effective option for common vehicles
- Fallback: Premium provider for exotic/Chinese EVs
- Cache results to minimize repeat lookups

---

## Implementation Outline (Generic)

### Step 1: API Integration (WorkshopOS)

**1.1 Add VIN Decode Service Module**
```typescript
// src/lib/services/vin-decoder.ts
interface VINDecodeResult {
  vin: string;
  make: string;
  model: string;
  year: number;
  variant?: string;
  engine?: {
    size?: string;
    type?: string;
    cylinders?: number;
  };
  transmission?: string;
  fuelType?: string;
  bodyType?: string;
  driveType?: string;
  buildDate?: string;
  features?: {
    adas?: string[];
    safety?: string[];
  };
  battery?: {
    capacity?: number;
    type?: string;
  };
  source: string; // API provider name
  confidence: number; // 0-100
}

class VINDecoderService {
  async decode(vin: string): Promise<VINDecodeResult>;
  async validateVIN(vin: string): Promise<boolean>;
}
```

**1.2 Environment Configuration**
```env
# .env
VIN_DECODER_PROVIDER=suncars  # or vinlookup, etc.
VIN_DECODER_API_KEY=your-api-key
VIN_DECODER_API_URL=https://api.provider.com/v1
VIN_DECODER_CACHE_TTL=2592000  # 30 days
```

**1.3 Caching Layer**
```typescript
// Cache VIN results to minimize API costs
// Use SQLite or Redis for caching
// TTL: 30 days (vehicle specs don't change)
```

### Step 2: Data Mapping to Vehicle Schema

**2.1 Map API Response to WorkshopOS Vehicle Model**
```typescript
// Map VIN decode result to vehicle table schema
function mapVINDataToVehicle(
  vinResult: VINDecodeResult,
  customerId: string
): VehicleCreateInput {
  return {
    customerId,
    vin: vinResult.vin,
    make: vinResult.make,
    model: vinResult.model,
    year: vinResult.year,
    variant: vinResult.variant,
    // ... map other fields
    metadata: {
      vinDecodeSource: vinResult.source,
      vinDecodeConfidence: vinResult.confidence,
      lastVINDecodeAt: new Date().toISOString(),
    }
  };
}
```

**2.2 Handle Partial Data**
```typescript
// If VIN decode returns partial data:
// 1. Populate known fields
// 2. Mark unknown fields for manual entry
// 3. Set confidence score
// 4. Allow user to override/complete data
```

### Step 3: Fallback Strategy

**3.1 Primary API Failure**
```typescript
async function decodeVINWithFallback(vin: string): Promise<VINDecodeResult> {
  // 1. Try primary provider
  try {
    return await primaryProvider.decode(vin);
  } catch (error) {
    // 2. Try fallback provider (if configured)
    if (fallbackProvider) {
      return await fallbackProvider.decode(vin);
    }
    // 3. Return partial result with manual entry prompt
    return {
      vin,
      make: null,
      model: null,
      year: null,
      source: 'manual',
      confidence: 0,
    };
  }
}
```

**3.2 Unknown VIN Handling**
```typescript
// If VIN not found in database:
// 1. Validate VIN checksum
// 2. Show friendly error: "Vehicle not found in database"
// 3. Offer manual entry form
// 4. Log unknown VIN for analysis (may indicate new model)
```

**3.3 Data Quality Issues**
```typescript
// If confidence < 80%:
// 1. Show decoded data as suggestions
// 2. Allow user to confirm or correct
// 3. Save user corrections
// 4. Report low-quality results to provider (if supported)
```

### Step 4: Testing Plan

**4.1 Unit Tests**
```typescript
describe('VINDecoderService', () => {
  it('should decode valid Australian Toyota VIN', async () => {
    const result = await vinDecoder.decode('JT2AE82E002123456');
    expect(result.make).toBe('Toyota');
    expect(result.confidence).toBeGreaterThan(90);
  });

  it('should handle Chinese EV VIN', async () => {
    const result = await vinDecoder.decode('LGWEF4A51P0123456');
    expect(result.make).toBe('BYD');
    expect(result.fuelType).toBe('Electric');
  });

  it('should return error for invalid VIN', async () => {
    await expect(vinDecoder.decode('INVALID123')).rejects.toThrow();
  });

  it('should use cached result on second lookup', async () => {
    await vinDecoder.decode('JT2AE82E002123456');
    const start = Date.now();
    await vinDecoder.decode('JT2AE82E002123456');
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(50); // Cache hit should be fast
  });
});
```

**4.2 Integration Tests**
```typescript
describe('VIN Decode Integration', () => {
  it('should create vehicle from VIN decode', async () => {
    const customer = await createTestCustomer();
    const vehicle = await createVehicleFromVIN(customer.id, testVIN);
    expect(vehicle.make).toBeDefined();
    expect(vehicle.model).toBeDefined();
  });
});
```

**4.3 Manual Testing Checklist**
- [ ] Test common Australian brands (Toyota, Ford, Mazda, Hyundai)
- [ ] Test Chinese EVs (BYD, MG)
- [ ] Test European imports (BMW, VW, Mercedes)
- [ ] Test Japanese imports
- [ ] Test very new vehicles (current year)
- [ ] Test older vehicles (10+ years)
- [ ] Test invalid VINs (should error gracefully)
- [ ] Test API timeout scenario
- [ ] Test rate limiting scenario
- [ ] Verify caching works correctly
- [ ] Test manual fallback entry

**4.4 Performance Testing**
- [ ] Measure average API response time
- [ ] Test with 100+ concurrent requests
- [ ] Verify cache effectiveness (hit rate >80% after warmup)
- [ ] Monitor API costs over test period

---

## Australian Market Notes

### Current Market Composition (2024-2025)

**Traditional Leaders:**
- Toyota: ~18% market share (Corolla, Camry, RAV4, HiLux, LandCruiser)
- Ford: ~8% market share (Ranger, Everest, Focus, Mustang)
- Mazda: ~8% market share (CX-5, CX-30, Mazda3, BT-50)
- Hyundai: ~6% market share (i30, Tucson, Santa Fe, Kona)
- Mitsubishi: ~6% market share (Triton, ASX, Outlander)
- Kia: ~5% market share (Sportage, Cerato, Carnival)

**Holden:** No longer manufacturing, but large existing fleet requiring service

**Growing EV Segment (10-15% of new sales):**

**Chinese Brands:**
- BYD: Atto 3 (top-selling EV), Dolphin, Seal - rapid growth
- MG Motor (SAIC): MG4 Electric, ZS EV, MG5 - high volume
- Great Wall/HAVAL: H6, Jolion (PHEV)
- GWM Ora (electric city car)
- NIO: ET7, ES8 (premium segment, limited volume)
- Li Auto: Emerging, limited presence
- XPeng: Emerging, limited presence

**Non-Chinese EVs:**
- Tesla: Model 3, Model Y - market leaders
- Polestar: Polestar 2, Polestar 3 (Volvo/Geely)
- Hyundai: Ioniq 5, Ioniq 6, Kona Electric
- Kia: EV6, Niro EV
- BMW: iX, i4
- Mercedes: EQC, EQA, EQB

### Regional Considerations

**Urban Workshops (Sydney, Melbourne, Brisbane):**
- Higher EV adoption (15-20% of new sales)
- More Chinese brands (BYD, MG, NIO)
- More European imports
- ADAS features common
- Need comprehensive brand coverage

**Rural/Regional Workshops:**
- Lower EV adoption (<5%)
- Traditional brands dominate (Toyota, Ford, Mazda)
- More commercial vehicles (HiLux, Ranger, Triton)
- Older vehicle fleet
- Basic VIN decode acceptable

### Import Considerations

**Japanese Used Imports:**
- Large market for used Japanese vehicles
- Right-hand drive
- May have different specs vs Australian-delivered
- VIN decode may be challenging (JDM-specific models)

**Grey Imports:**
- European performance cars
- American muscle cars (LHD conversions)
- Limited VIN database coverage
- May require manual entry

### ADAS and Safety Features

**Increasingly Important for:**
- EVs (often include advanced ADAS as standard)
- Vehicles 2020+ (AEB becoming standard)
- Premium brands
- Diagnostic and calibration requirements

**Common ADAS features:**
- AEB (Autonomous Emergency Braking)
- ACC (Adaptive Cruise Control)
- LKA (Lane Keep Assist)
- BSM (Blind Spot Monitoring)
- TSR (Traffic Sign Recognition)
- Parking sensors/cameras

**VIN decode should identify:**
- Presence of ADAS systems
- Camera/sensor locations
- Calibration requirements

---

## Chinese EV Specific Research

### Priority Brands (by AU market share)

**1. BYD (Build Your Dreams)**
**Models in Australia:**
- Atto 3 (compact SUV, best-seller)
- Dolphin (hatchback)
- Seal (sedan)
- Seal U (upcoming)

**VIN Decode Requirements:**
- Battery: Blade Battery (LFP), capacity
- Motor: Single/dual motor configuration
- Range: WLTP/ADR 81/02 range
- ADAS: BYD Pilot features
- Charging: AC/DC charging rates

**Sample VIN format:** LGWEF4A5XP0XXXXXX (if available)

**2. MG Motor (SAIC Motor)**
**Models in Australia:**
- MG4 Electric (hatchback, high volume)
- ZS EV (compact SUV)
- MG5 (wagon)
- Cyberster (upcoming sports car)

**VIN Decode Requirements:**
- Battery: NMC or LFP, capacity
- Motor: RWD/AWD configuration
- Range: Varies by variant
- ADAS: MG Pilot suite
- Charging: Rates and standards

**Sample VIN format:** LSJW74S5XN0XXXXXX (if available)

**3. Great Wall/HAVAL**
**Models in Australia:**
- HAVAL H6 (SUV, hybrid and PHEV)
- HAVAL Jolion (compact SUV, hybrid)
- GWM Ute (pickup truck)
- GWM Ora (electric city car)

**VIN Decode Requirements:**
- Powertrain: Petrol, hybrid, or PHEV
- Battery: Capacity for PHEV models
- Engine: Size and configuration
- Drive: 2WD/4WD

**Sample VIN format:** [Requires research]

**4. NIO**
**Models in Australia:**
- ET7 (sedan, premium)
- ES8 (SUV, 7-seater)
- Limited volume (urban centers only)

**VIN Decode Requirements:**
- Battery: 75kWh, 100kWh, 150kWh (swappable)
- Motor: Dual/tri-motor configuration
- ADAS: NIO Pilot, LiDAR
- Software: NOMI AI system
- Battery swap capability

**Sample VIN format:** [Requires research]

### Chinese EV Data Challenges

**Potential Issues:**
1. **New to market:** Some models too new for databases
2. **Variant complexity:** Multiple battery/motor configurations
3. **Rapid updates:** OTA software changes features
4. **Limited history:** No established VIN decode patterns
5. **Naming:** Chinese vs English model names
6. **Import variations:** AU-spec vs other markets

**Mitigation Strategies:**
1. Test with real VINs from AU dealerships
2. Verify battery and motor specs critically important
3. Plan for manual data entry fallback
4. Consider manufacturer APIs (if available)
5. Build internal database for common Chinese EVs

### Testing Requirements for Chinese EVs

**Must verify each provider can decode:**
- [ ] BYD Atto 3 (most critical)
- [ ] MG4 Electric (most critical)
- [ ] BYD Dolphin
- [ ] BYD Seal
- [ ] MG ZS EV
- [ ] HAVAL H6 PHEV
- [ ] HAVAL Jolion Hybrid
- [ ] GWM Ora
- [ ] NIO ET7 (if sample available)

**Data accuracy verification:**
- [ ] Battery capacity correct
- [ ] Motor configuration correct
- [ ] Range figures accurate
- [ ] ADAS features listed
- [ ] Charging specifications correct

---

## Implementation Questions for WorkshopOS Team

### Decision Points

**1. Cost vs Coverage Trade-off**
- What is acceptable cost per VIN lookup?
- Is <$0.10 target firm or flexible?
- Willing to pay premium for better Chinese EV coverage?

**2. Coverage Requirements**
- What % of customer vehicles are Chinese brands?
- Are there specific brands we must support?
- Can we use manual entry fallback for exotic brands?

**3. Data Completeness**
- Which data fields are critical vs nice-to-have?
- Do we need ADAS feature detection?
- Is battery capacity required for EV service?

**4. User Experience**
- Should VIN decode be automatic on VIN entry?
- Or explicit "Fetch vehicle details" button?
- How to handle low-confidence results (user confirms)?

**5. Caching Strategy**
- How long to cache VIN decode results?
- Store in database or separate cache?
- Handle VIN decode updates (model year changes)?

**6. Multi-Provider Support**
- Build with single provider initially?
- Or support multiple providers from start?
- Fallback chain: Primary -> Secondary -> Manual?

**7. Error Handling**
- How to handle API downtime?
- Show error message or silent fallback to manual?
- Retry strategy for transient failures?

**8. Monitoring & Analytics**
- Track VIN decode success rate?
- Monitor API costs?
- Log unknown VINs for analysis?

### Technical Decisions

**1. Architecture**
```typescript
// Option A: Direct integration in vehicle service
class VehicleService {
  async createFromVIN(vin: string, customerId: string) {
    const vinData = await vinDecoder.decode(vin);
    return await this.create({...vinData, customerId});
  }
}

// Option B: Separate VIN decoder service
class VINDecoderService {
  async decode(vin: string): Promise<VehicleData>;
}
class VehicleService {
  async createFromVINData(vinData: VehicleData, customerId: string);
}
```

**2. Caching Implementation**
```typescript
// Option A: Database table (vin_cache)
// Option B: Redis/Memcached
// Option C: File-based cache (simple)
```

**3. API Client**
```typescript
// Option A: Custom fetch wrapper
// Option B: Library (axios, got, ky)
// Option C: Provider SDK (if available)
```

---

## Next Steps

### Immediate Actions Required

1. **Web Research** (Priority 1)
   - Execute all web searches outlined in Research Methodology
   - Contact providers for pricing and documentation
   - Test sample VINs with available APIs

2. **Provider Comparison** (Priority 1)
   - Fill in comparison matrix with real data
   - Test actual API responses
   - Verify Chinese EV coverage with real VINs

3. **Cost Analysis** (Priority 2)
   - Calculate projected monthly costs based on workshop volume
   - Identify volume discount thresholds
   - Determine ROI vs manual entry time savings

4. **Technical Evaluation** (Priority 2)
   - Review API documentation quality
   - Test integration complexity
   - Assess error handling

5. **Recommendation** (Priority 1)
   - Select primary provider based on criteria
   - Identify fallback option (if applicable)
   - Document decision rationale

### Timeline

**Week 1:**
- Complete web research
- Contact top 3-5 providers
- Test sample VINs

**Week 2:**
- Evaluate API documentation
- Build proof-of-concept integration
- Finalize provider selection

**Week 3:**
- Implement VIN decoder service in WorkshopOS
- Add caching layer
- Build UI components

**Week 4:**
- Testing and refinement
- Documentation
- Deploy to staging

---

## Appendix: Sample VINs for Testing

### Australian Delivered Vehicles

**Toyota:**
- JT2AE82E002123456 (Corolla)
- JTMRH05V804123456 (RAV4)
- 5TFUY5F13LX123456 (HiLux)

**Ford:**
- 6FPAAAJGXFG123456 (Ranger)
- WF0RXXGCHRR123456 (Focus)

**Mazda:**
- JM1DKFC74K0123456 (CX-5)
- 3MZBN1U77LM123456 (Mazda3)

**Hyundai:**
- KMHSH81XDHU123456 (i30)
- 5NMS5CAD1PH123456 (Santa Fe)

### Chinese EVs (Sample format - requires validation)

**BYD:**
- LGWEF4A51P0123456 (Atto 3 - placeholder)
- [Dolphin VIN needed]
- [Seal VIN needed]

**MG:**
- LSJW74S58N0123456 (MG4 Electric - placeholder)
- [ZS EV VIN needed]

**Great Wall/HAVAL:**
- [H6 VIN needed]
- [Jolion VIN needed]

### Tesla (for comparison)

- 5YJ3E1EA8KF123456 (Model 3)
- 7SAYGDEE9NF123456 (Model Y)

**Note:** Real VINs needed for actual testing. Contact dealerships or use customer vehicles (with permission).

---

## Research Status

- [ ] Web research completed
- [ ] Providers identified and contacted
- [ ] Pricing information gathered
- [ ] API documentation reviewed
- [ ] Sample VINs tested
- [ ] Comparison matrix completed
- [ ] Recommendation finalized
- [ ] Implementation plan approved

**Document Version:** 1.0 (PRELIMINARY)
**Last Updated:** 2025-12-22
**Next Review:** After web research completion

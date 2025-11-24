(() => {
  try {
    const TARGET_OPERATIONS = ["UserByScreenName", "UserByRestId", "HomeTimeline", "UserProfile", "UserAbout", "Profile"];
    const LOOKUP_KEYS = new Set([
      "verification_info",
      "profile_transparency",
      "affiliates_highlighted_label"
    ]);

    const originalFetch = window.fetch;
    if (typeof originalFetch !== "function") {
      console.warn("int-x: window.fetch unavailable");
      return;
    }

    const shouldInspectRequest = async (url, request) => {
      if (!url) return false;
      
      
      // Check URL first
      if (TARGET_OPERATIONS.some((token) => url.includes(token))) {
        return true;
      }
      
      // Check request body for GraphQL operations
      if (request && request.body) {
        try {
          const bodyText = await request.clone().text();
          if (TARGET_OPERATIONS.some((token) => bodyText.includes(token))) {
            return true;
          }
        } catch (e) {
          // Body might not be readable, that's ok
        }
      }
      
      // Also inspect ALL GraphQL requests (not just target operations) to find "Account based in"
      if (url.includes("/graphql/") || url.includes("/i/api/graphql")) {
        return true;
      }
      
      return false;
    };

    const findVerificationData = (
      node,
      accumulator = [],
      seen = new WeakSet(),
      inheritedUserId = null
    ) => {
      if (!node || typeof node !== "object" || seen.has(node)) return accumulator;
      seen.add(node);

      const currentUserId =
        node.rest_id || node.user_id || node.id || inheritedUserId;
      const hasGeoSignal = Object.keys(node).some((key) => LOOKUP_KEYS.has(key));

      if (currentUserId && hasGeoSignal) {
        // Include the full node so we can search for country data in sibling fields
        accumulator.push({
          userId: currentUserId,
          verificationInfo: node.verification_info || null,
          profileTransparency: node.profile_transparency || null,
          affiliatesLabel: node.affiliates_highlighted_label || null,
          fullNode: node // Include full context for country code extraction
        });
      }

      for (const value of Object.values(node)) {
        if (value && typeof value === "object") {
          findVerificationData(value, accumulator, seen, currentUserId);
        }
      }

      return accumulator;
    };

    const findCountryCodeRecursive = (obj, seen = new WeakSet(), depth = 0) => {
      if (depth > 10 || !obj || typeof obj !== "object" || seen.has(obj)) return null;
      seen.add(obj);

      // Check for common country code patterns
      for (const [key, value] of Object.entries(obj)) {
        const keyLower = String(key).toLowerCase();
        
        // Look for country code fields
        if ((keyLower.includes("country") || keyLower.includes("country_code") || keyLower === "cc") && typeof value === "string" && /^[A-Z]{2}$/i.test(value)) {
          const code = value.toUpperCase();
          if (isValidCountryCode(code)) return code;
        }
        
        // Look for country in descriptions
        if (keyLower.includes("description") && typeof value === "string") {
          const match = value.match(/\b([A-Z]{2})\b/);
          if (match) {
            const code = match[1];
            // Validate it's a valid country code
            if (isValidCountryCode(code)) {
              return code;
            }
          }
        }
        
        // Recurse into nested objects
        if (value && typeof value === "object") {
          const found = findCountryCodeRecursive(value, seen, depth + 1);
          if (found) return found;
        }
      }
      
      return null;
    };

    // Valid ISO 3166-1 alpha-2 country codes (excludes US state codes like DC, CA, NY, etc.)
    const VALID_COUNTRY_CODES = new Set([
      "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
      "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ",
      "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
      "DE", "DJ", "DK", "DM", "DO", "DZ",
      "EC", "EE", "EG", "EH", "ER", "ES", "ET",
      "FI", "FJ", "FK", "FM", "FO", "FR",
      "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY",
      "HK", "HM", "HN", "HR", "HT", "HU",
      "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
      "JE", "JM", "JO", "JP",
      "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
      "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
      "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
      "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ",
      "OM",
      "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY",
      "QA",
      "RE", "RO", "RS", "RU", "RW",
      "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ",
      "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
      "UA", "UG", "UM", "US", "UY", "UZ",
      "VA", "VC", "VE", "VG", "VI", "VN", "VU",
      "WF", "WS",
      "YE", "YT",
      "ZA", "ZM", "ZW"
    ]);

    const isValidCountryCode = (code) => {
      if (!code || typeof code !== "string") return false;
      return VALID_COUNTRY_CODES.has(code.toUpperCase());
    };

    const countryNameToCode = {
      "canada": "CA",
      "united states": "US",
      "united states of america": "US",
      "usa": "US",
      "united kingdom": "GB",
      "uk": "GB",
      "great britain": "GB",
      "australia": "AU",
      "germany": "DE",
      "france": "FR",
      "japan": "JP",
      "china": "CN",
      "india": "IN",
      "brazil": "BR",
      "russia": "RU",
      "south korea": "KR",
      "mexico": "MX",
      "spain": "ES",
      "italy": "IT",
      "netherlands": "NL",
      "sweden": "SE",
      "norway": "NO",
      "denmark": "DK",
      "finland": "FI",
      "poland": "PL",
      "turkey": "TR",
      "south africa": "ZA",
      "egypt": "EG",
      "saudi arabia": "SA",
      "uae": "AE",
      "united arab emirates": "AE",
      "israel": "IL",
      "singapore": "SG",
      "thailand": "TH",
      "indonesia": "ID",
      "philippines": "PH",
      "vietnam": "VN",
      "malaysia": "MY",
      "new zealand": "NZ",
      "ireland": "IE",
      "switzerland": "CH",
      "austria": "AT",
      "belgium": "BE",
      "portugal": "PT",
      "greece": "GR",
      "czech republic": "CZ",
      "romania": "RO",
      "hungary": "HU",
      "ukraine": "UA",
      "argentina": "AR",
      "chile": "CL",
      "colombia": "CO",
      "peru": "PE",
      "venezuela": "VE",
      "pakistan": "PK",
      "bangladesh": "BD",
      "nigeria": "NG",
      "kenya": "KE",
      "ghana": "GH",
      "ethiopia": "ET",
      "morocco": "MA",
      "algeria": "DZ",
      "tunisia": "TN",
      "libya": "LY",
      "sudan": "SD",
      "iraq": "IQ",
      "iran": "IR",
      "afghanistan": "AF",
      "kazakhstan": "KZ",
      "uzbekistan": "UZ",
      "azerbaijan": "AZ",
      "georgia": "GE",
      "armenia": "AM",
      "lebanon": "LB",
      "jordan": "JO",
      "kuwait": "KW",
      "qatar": "QA",
      "bahrain": "BH",
      "oman": "OM",
      "yemen": "YE",
      "syria": "SY",
      "sri lanka": "LK",
      "nepal": "NP",
      "myanmar": "MM",
      "cambodia": "KH",
      "laos": "LA",
      "mongolia": "MN",
      "north korea": "KP",
      "taiwan": "TW",
      "hong kong": "HK",
      "macau": "MO",
      "bangladesh": "BD",
      "sri lanka": "LK",
      "kazakhstan": "KZ",
      "uzbekistan": "UZ",
      "kyrgyzstan": "KG",
      "tajikistan": "TJ",
      "turkmenistan": "TM",
      "afghanistan": "AF",
      "pakistan": "PK",
      "iran": "IR",
      "iraq": "IQ",
      "syria": "SY",
      "lebanon": "LB",
      "jordan": "JO",
      "israel": "IL",
      "palestine": "PS",
      "saudi arabia": "SA",
      "yemen": "YE",
      "oman": "OM",
      "uae": "AE",
      "united arab emirates": "AE",
      "qatar": "QA",
      "kuwait": "KW",
      "bahrain": "BH",
      "egypt": "EG",
      "libya": "LY",
      "tunisia": "TN",
      "algeria": "DZ",
      "morocco": "MA",
      "sudan": "SD",
      "ethiopia": "ET",
      "kenya": "KE",
      "tanzania": "TZ",
      "uganda": "UG",
      "rwanda": "RW",
      "ghana": "GH",
      "nigeria": "NG",
      "senegal": "SN",
      "mali": "ML",
      "burkina faso": "BF",
      "niger": "NE",
      "chad": "TD",
      "cameroon": "CM",
      "central african republic": "CF",
      "democratic republic of the congo": "CD",
      "republic of the congo": "CG",
      "gabon": "GA",
      "equatorial guinea": "GQ",
      "sao tome and principe": "ST",
      "angola": "AO",
      "zambia": "ZM",
      "malawi": "MW",
      "mozambique": "MZ",
      "madagascar": "MG",
      "mauritius": "MU",
      "seychelles": "SC",
      "comoros": "KM",
      "djibouti": "DJ",
      "eritrea": "ER",
      "somalia": "SO",
      "south sudan": "SS",
      "burundi": "BI",
      "zimbabwe": "ZW",
      "botswana": "BW",
      "namibia": "NA",
      "lesotho": "LS",
      "eswatini": "SZ",
      "south africa": "ZA"
    };

    const REGION_MAPPINGS = [
      {
        keywords: ["north america"],
        label: "North America"
      },
      {
        keywords: ["south america", "latin america"],
        label: "South America"
      },
      {
        keywords: ["east asia", "east asia and pacific", "asia pacific", "apac", "east asia & pacific"],
        label: "East Asia & Pacific"
      },
      {
        keywords: ["west asia", "western asia", "middle east"],
        label: "West Asia / Middle East"
      },
      {
        keywords: ["central asia"],
        label: "Central Asia"
      },
      {
        keywords: ["europe", "eu"],
        label: "Europe"
      },
      {
        keywords: ["sub-saharan africa", "ssa"],
        label: "Sub-Saharan Africa"
      },
      {
        keywords: ["east africa"],
        label: "East Africa"
      },
      {
        keywords: ["west africa"],
        label: "West Africa"
      },
      {
        keywords: ["southern africa"],
        label: "Southern Africa"
      },
      {
        keywords: ["north africa"],
        label: "North Africa"
      },
      {
        keywords: ["oceania"],
        label: "Oceania"
      },
      {
        keywords: ["caribbean"],
        label: "Caribbean"
      },
      {
        keywords: ["central america"],
        label: "Central America"
      }
    ];

    const detectCountryFromText = (text) => {
      if (typeof text !== "string") return null;
      // First try country name matching (more reliable)
      const normalized = text.toLowerCase();
      for (const [name, code] of Object.entries(countryNameToCode)) {
        if (normalized.includes(name)) return code;
      }
      // Then try 2-letter code matching, but validate it
      const match = text.match(/\b([A-Z]{2})\b/);
      if (match) {
        const code = match[1].toUpperCase();
        if (isValidCountryCode(code)) return code;
      }
      return null;
    };

    const extractCountryFromAffiliatesLabel = (label) => {
      if (!label || typeof label !== "object") return null;
      const candidates = [
        label.countryCode,
        label.country_code,
        label.country,
        label?.badge?.countryCode,
        label?.badge?.country,
        label?.badge?.country_code,
        label?.label?.countryCode,
        label?.label?.country_code
      ];
      const code = candidates.find(
        (value) => typeof value === "string" && value.trim().length > 0
      );
      if (code) return code.trim().toUpperCase();

      const textCandidates = [
        label.label?.description,
        label.label?.richtext?.text,
        label.label?.text,
        label.description,
        label.longDescription,
        label.shortDescription
      ];
      for (const text of textCandidates) {
        const detected = detectCountryFromText(text);
        if (detected) return detected;
      }

      return null;
    };

    const extractCountryFromVerificationInfo = (verificationInfo) => {
      if (!verificationInfo || typeof verificationInfo !== "object") return null;
      const direct = [
        verificationInfo.reason?.countryCode,
        verificationInfo.reason?.country_code
      ].find((value) => typeof value === "string" && value.trim().length > 0);
      if (direct) return direct.trim().toUpperCase();
      const description =
        verificationInfo.reason?.description ||
        verificationInfo.reason?.name ||
        verificationInfo.description;
      return detectCountryFromText(description);
    };

    const detectRegionName = (value) => {
      if (typeof value !== "string" || !value.trim()) return null;
      const normalized = value.toLowerCase();
      for (const mapping of REGION_MAPPINGS) {
        if (mapping.keywords.some((keyword) => normalized.includes(keyword))) {
          return mapping.label;
        }
      }
      return null;
    };

    const extractLocationData = (entry) => {
      let regionName = null;

      // PRIORITY 1: about_profile.account_based_in (MOST RELIABLE - this is what X.com displays)
      if (entry.fullNode?.about_profile?.account_based_in) {
        const countryName = String(entry.fullNode.about_profile.account_based_in).trim();
        // Try to convert country name to code
        const code = countryNameToCode[countryName.toLowerCase()];
        if (code && isValidCountryCode(code)) {
          return { countryCode: code, regionName: null };
        }
        // If it's already a 2-letter code, validate it
        if (/^[A-Z]{2}$/i.test(countryName)) {
          const upperCode = countryName.toUpperCase();
          if (isValidCountryCode(upperCode)) {
            return { countryCode: upperCode, regionName: null };
          }
        }
        regionName = detectRegionName(countryName);
        if (regionName) {
          return { countryCode: null, regionName };
        }
        // If we have account_based_in but couldn't extract a valid code, return null
        return { countryCode: null, regionName: null };
      }

      // PRIORITY 2: source field from about_profile (e.g., "Canada App Store" -> "CA")
      if (entry.fullNode?.about_profile?.source) {
        const source = String(entry.fullNode.about_profile.source);
        // Try to extract country from "Country App Store" pattern
        for (const [name, code] of Object.entries(countryNameToCode)) {
          if (source.toLowerCase().includes(name) && isValidCountryCode(code)) {
            return { countryCode: code, regionName: null };
          }
        }
        const detectedRegion = detectRegionName(source);
        if (detectedRegion) {
          return { countryCode: null, regionName: detectedRegion };
        }
      }

      // PRIORITY 3: Direct country code fields (only if about_profile doesn't exist)
      const candidates = [
        entry.profileTransparency?.countryCode,
        entry.profileTransparency?.country_code,
        entry.verificationInfo?.reason?.countryCode,
        entry.verificationInfo?.reason?.country_code,
        entry.verificationInfo?.state?.countryCode,
        entry.verificationInfo?.state?.country_code,
        entry.verificationInfo?.countryCode,
        entry.verificationInfo?.country_code,
        entry.affiliatesLabel?.countryCode,
        entry.affiliatesLabel?.country_code
      ];

      const code = candidates.find(
        (value) => typeof value === "string" && value.trim().length > 0 && isValidCountryCode(value.trim())
      );

      if (code) return { countryCode: code.trim().toUpperCase(), regionName: null };

      // PRIORITY 4: Recursive search (least reliable, only if no direct fields found)
      // Skip this if we have about_profile but no account_based_in (means it's empty/null)
      if (entry.fullNode?.about_profile && !entry.fullNode.about_profile.account_based_in) {
        return { countryCode: null, regionName: null };
      }

      if (entry.fullNode) {
        const found = findCountryCodeRecursive(entry.fullNode);
        if (found && isValidCountryCode(found)) return { countryCode: found, regionName: null };
      }

      return { countryCode: null, regionName: null };
    };

    const deriveConfidenceSignals = (entry, resolvedCountryCode, regionName) => {
      const basedInByAbout =
        entry.fullNode?.about_profile?.account_based_in || null;
      const basedInCountry =
        resolvedCountryCode ||
        extractCountryFromVerificationInfo(entry.verificationInfo) ||
        detectCountryFromText(basedInByAbout);
      const connectedViaCountry = extractCountryFromAffiliatesLabel(
        entry.affiliatesLabel
      );
      let confidence = "unknown";

      if (connectedViaCountry && basedInCountry) {
        confidence =
          connectedViaCountry === basedInCountry ? "high" : "mismatch";
      } else if (basedInCountry) {
        confidence = "partial";
      }

      return {
        confidence,
        signals: {
          basedIn: basedInCountry || null,
          connectedVia: connectedViaCountry || null,
          reasonCountry: extractCountryFromVerificationInfo(
            entry.verificationInfo
          ),
          aboutBasedIn: basedInByAbout || null,
          region: regionName || null
        }
      };
    };

    const deduceSignalType = (entry) => {
      if (entry.profileTransparency) return "PROFILE_TRANSPARENCY";
      if (entry.affiliatesLabel) return "AFFILIATES_LABEL";
      if (entry.verificationInfo) return "VERIFICATION_INFO";
      return "UNKNOWN";
    };

    const detectVPNProxy = (entry) => {
      const aboutProfile = entry.fullNode?.about_profile;
      if (!aboutProfile) return false;

      const explicitIndicators = [
        aboutProfile.is_proxy,
        aboutProfile.isProxy,
        aboutProfile.uses_proxy,
        aboutProfile.usesProxy,
        aboutProfile.proxy,
        aboutProfile.proxy_enabled
      ];

      const vpnKeywords = [
        "vpn",
        "virtual private network",
        "proxy",
        "private relay",
        "tor",
        "onion",
        "anonymizer",
        "anonymizing",
        "warp",
        "orbot",
        "psiphon",
        "secure relay"
      ];

      const containsKeyword = (keywords) => (value) => {
        if (typeof value !== "string") return false;
        const normalized = value.toLowerCase();
        return keywords.some((keyword) => {
          // Use word boundaries to avoid false positives (e.g., "america" matching "anonym")
          const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          return regex.test(normalized);
        });
      };

      const textSources = [
        aboutProfile.source,
        aboutProfile.account_based_in,
        aboutProfile.account_label,
        aboutProfile.note,
        aboutProfile.description,
        entry.affiliatesLabel?.label?.description,
        entry.affiliatesLabel?.label?.richtext?.text,
        entry.affiliatesLabel?.label?.text,
        entry.affiliatesLabel?.description,
        entry.verificationInfo?.reason?.description,
        entry.verificationInfo?.reason?.name,
        entry.verificationInfo?.description
      ];

      const hasExplicitProxy = explicitIndicators.some(
        (value) => value === true || value === "true" || value === 1
      );
      const hasVpnKeyword = textSources.some(containsKeyword(vpnKeywords));

      const source = String(aboutProfile.source || "").toLowerCase();
      const affiliateUsername = String(
        aboutProfile.affiliate_username || ""
      ).toLowerCase();
      const vpnPatterns = ["vpn", "proxy", "relay", "anonym", "tor", "warp"];
      const hasVpnPattern = vpnPatterns.some((pattern) => {
        // Use word boundaries to avoid false positives
        const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(source) || regex.test(affiliateUsername);
      });

      // location_accurate: false is X.com's primary indicator for VPN/proxy usage
      // But exclude regions (like "North America", "East Asia & Pacific") which are legitimate
      const accountBasedIn = String(aboutProfile.account_based_in || "").toLowerCase();
      const isRegion = REGION_MAPPINGS.some(mapping => 
        mapping.keywords.some(keyword => accountBasedIn.includes(keyword))
      );
      const locationAccurate = aboutProfile.location_accurate === true;
      const locationInaccurate = aboutProfile.location_accurate === false;
      
      // If location is inaccurate and it's NOT a region, it's VPN
      // (X.com shows VPN lock when location_accurate is false for countries)
      const isVPNFromLocation = locationInaccurate && !isRegion;

      const isVPN = locationAccurate 
        ? false  // If location is accurate, it's NOT a VPN
        : (hasExplicitProxy || hasVpnKeyword || hasVpnPattern || isVPNFromLocation);


      return isVPN;
    };

    const dispatchGeoPayloads = (payloads) => {
      payloads.forEach((entry) => {
        // Only extract country code if we have about_profile.account_based_in
        // This is the most reliable source and what X.com displays
        const hasAboutProfile = entry.fullNode?.about_profile?.account_based_in;
        
        if (!hasAboutProfile) {
          // Skip if no about_profile - means we're not on the About page yet
          return;
        }

        const locationData = extractLocationData(entry);
        if (!locationData.countryCode && !locationData.regionName) return;

        const { confidence, signals } = deriveConfidenceSignals(
          entry,
          locationData.countryCode,
          locationData.regionName
        );

        const isVPN = detectVPNProxy(entry);

        const handle =
          entry.fullNode?.core?.screen_name ||
          entry.fullNode?.legacy?.screen_name ||
          entry.fullNode?.about_profile?.username ||
          null;

        const message = {
          type: "X_GEO_FOUND",
          payload: {
            userId: entry.userId,
            handle,
            countryCode: locationData.countryCode,
            regionName: locationData.regionName,
            signalType: deduceSignalType(entry),
            confidence,
            signals,
            isVPN,
            meta: {
              verificationInfo: entry.verificationInfo,
              profileTransparency: entry.profileTransparency,
              affiliatesLabel: entry.affiliatesLabel,
              aboutProfile: entry.fullNode?.about_profile || null
            }
          }
        };
        window.postMessage(message, "*");
      });
    };

    const searchForAccountBasedIn = (obj, seen = new WeakSet(), depth = 0) => {
      if (depth > 15 || !obj || typeof obj !== "object" || seen.has(obj)) return null;
      seen.add(obj);

      for (const [key, value] of Object.entries(obj)) {
        // Look for "Account based in" text
        if (typeof value === "string" && value.toLowerCase().includes("account based in")) {
          // Try to extract country code from the text
          const match = value.match(/account based in\s+([A-Z]{2})/i);
          if (match) {
            return match[1].toUpperCase();
          }
          // Or look for country code nearby
          const codeMatch = value.match(/\b([A-Z]{2})\b/);
          if (codeMatch) {
            return codeMatch[1];
          }
        }
        
        // Recurse
        if (value && typeof value === "object") {
          const found = searchForAccountBasedIn(value, seen, depth + 1);
          if (found) return found;
        }
      }
      
      return null;
    };

    const processResponseData = async (data, url, request) => {
      try {
        const shouldInspect = await shouldInspectRequest(url, request);
        if (!shouldInspect) return;
        
        // First, search for "Account based in" text anywhere in response
        const accountBasedInCountry = searchForAccountBasedIn(data);
        if (accountBasedInCountry) {
          const userId = findUserIdInResponse(data);
          if (userId) {
            dispatchGeoPayloads([{
              userId,
              countryCode: accountBasedInCountry,
              verificationInfo: null,
              profileTransparency: null,
              affiliatesLabel: null,
              fullNode: data
            }]);
            return;
          }
        }
        
        const payloads = findVerificationData(data);
        if (payloads.length > 0) {
          dispatchGeoPayloads(payloads);
        }
      } catch (error) {
        console.warn("int-x scan failed", error);
      }
    };

    const findUserIdInResponse = (obj, seen = new WeakSet(), depth = 0) => {
      if (depth > 10 || !obj || typeof obj !== "object" || seen.has(obj)) return null;
      seen.add(obj);
      
      for (const [key, value] of Object.entries(obj)) {
        if ((key === "rest_id" || key === "user_id" || key === "id") && value) {
          return String(value);
        }
        if (value && typeof value === "object") {
          const found = findUserIdInResponse(value, seen, depth + 1);
          if (found) return found;
        }
      }
      return null;
    };

    const processGraphQLResponse = async (response, url, request) => {
      try {
        const cloned = response.clone();
        const data = await cloned.json();
        await processResponseData(data, url, request);
      } catch (error) {
        console.warn("int-x scan failed", error);
      }
    };

    window.fetch = async function interceptedFetch(...args) {
      const response = await originalFetch.apply(this, args);
      try {
        const request = args[0];
        const url = typeof request === "string" ? request : request?.url;
        const method = request?.method || "GET";
        
        
        processGraphQLResponse(response, url, request);
      } catch (error) {
        console.warn("int-x fetch hook error", error);
      }
      return response;
    };

    // Also intercept XMLHttpRequest (X.com likely uses this)
    const OriginalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function XMLHttpRequest() {
      const xhr = new OriginalXHR();
      const originalOpen = xhr.open;
      const originalSend = xhr.send;
      let requestUrl = null;
      let requestMethod = null;
      let requestBody = null;

      xhr.open = function(method, url, ...rest) {
        requestMethod = method;
        requestUrl = url;
        return originalOpen.apply(this, [method, url, ...rest]);
      };

      xhr.send = function(body) {
        requestBody = body;
        

        const originalOnReadyStateChange = xhr.onreadystatechange;
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4 && xhr.status === 200) {
            try {
              const responseText = xhr.responseText;
              if (responseText) {
                const data = JSON.parse(responseText);
                processResponseData(data, requestUrl, { body: requestBody });
              }
            } catch (e) {
              // Not JSON or parsing failed
            }
          }
          if (originalOnReadyStateChange) {
            originalOnReadyStateChange.apply(this, arguments);
          }
        };

        return originalSend.apply(this, arguments);
      };

      return xhr;
    };

  } catch (error) {
    console.error("int-x injector initialization failed", error);
  }
})();


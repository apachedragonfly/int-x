const injectMainWorldScript = () => {
  try {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("inject.js");
    script.async = false;
    script.onload = () => script.remove();

    const parent = document.head || document.documentElement;
    parent.appendChild(script);
  } catch (error) {
    console.error("int-x injection failed", error);
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectMainWorldScript, {
    once: true
  });
} else {
  injectMainWorldScript();
}

const userGeoMap = new Map();
const handleToUserIdMap = new Map();
const USERNAME_SELECTOR = '[data-testid="User-Name"], [data-testid="UserName"]';

const FLAG_CLASS = "x-provenance-flag-chip";
const FLAG_ATTR = "data-x-provenance-flag";

let renderScheduled = false;
let observerStarted = false;

const normalizeHandle = (value) =>
  typeof value === "string" ? value.replace(/^@/, "").toLowerCase() : null;

const injectFlagStyles = () => {
  const ensure = () => {
    const target = document.head || document.documentElement;
    if (!target) {
      requestAnimationFrame(ensure);
      return;
    }

    if (document.getElementById("x-provenance-flag-style")) return;
    const style = document.createElement("style");
    style.id = "x-provenance-flag-style";
    style.textContent = `
      .${FLAG_CLASS} {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        margin-left: 0.5rem;
        line-height: 1;
        white-space: nowrap;
      }
      .${FLAG_CLASS} .x-provenance-flag-emoji {
        font-size: 1.5rem;
        line-height: 1;
        display: inline-block;
      }
      .${FLAG_CLASS} .x-provenance-warning-icon {
        width: 1.5rem;
        height: 1.5rem;
        flex-shrink: 0;
        color: rgb(15, 20, 25);
        display: inline-block;
        vertical-align: middle;
      }
      html[data-color-mode="dark"] .${FLAG_CLASS} .x-provenance-warning-icon {
        color: rgb(231, 233, 234);
      }
      .${FLAG_CLASS} .x-provenance-vpn-badge {
        width: 1.25rem;
        height: 1.25rem;
        flex-shrink: 0;
        color: rgb(15, 20, 25);
        display: inline-block;
        vertical-align: middle;
      }
      html[data-color-mode="dark"] .${FLAG_CLASS} .x-provenance-vpn-badge {
        color: rgb(231, 233, 234);
      }
    `;
    target.appendChild(style);
  };

  ensure();
};

const persistGeoEntry = (entry) => {
  try {
    chrome.storage?.local?.set({ [`geo:${entry.userId}`]: entry });
  } catch (error) {
    console.warn("int-x persistence failed", error);
  }
};

const restorePersistedGeoEntries = () => {
  if (!chrome.storage?.local) return;
  chrome.storage.local.get(null, (items) => {
    if (chrome.runtime?.lastError) {
      console.warn("int-x restore failed", chrome.runtime.lastError);
      return;
    }

    Object.entries(items || {}).forEach(([key, value]) => {
      if (!key.startsWith("geo:")) return;
      if (!value?.userId) return;
      if (!value?.countryCode && !value?.regionName) return;

      const entry = {
        userId: value.userId,
        handle: normalizeHandle(value.handle),
        countryCode: value.countryCode,
        regionName: value.regionName || null,
        signalType: value.signalType || "UNKNOWN",
        confidence: value.confidence || "unknown",
        signals: value.signals || {},
        isVPN: value.isVPN || false,
        meta: value.meta || {},
        cachedAt: value.cachedAt || Date.now()
      };

      userGeoMap.set(entry.userId, entry);
      if (entry.handle) handleToUserIdMap.set(entry.handle, entry.userId);
    });

    scheduleRender();
  });
};

const countryCodeToFlagEmoji = (countryCode) => {
  if (!countryCode || countryCode.length !== 2) return "🏳️";
  const upper = countryCode.toUpperCase();
  const base = 127397;
  const flag = [...upper]
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 65 && code <= 90 ? String.fromCodePoint(base + code) : "";
    })
    .join("");
  return flag || "🏳️";
};

const countryCodeToName = (countryCode) => {
  if (!countryCode || countryCode.length !== 2) return countryCode || "Unknown";
  const code = countryCode.toUpperCase();
  const countryNames = {
    "AD": "Andorra", "AE": "United Arab Emirates", "AF": "Afghanistan", "AG": "Antigua and Barbuda",
    "AI": "Anguilla", "AL": "Albania", "AM": "Armenia", "AO": "Angola", "AQ": "Antarctica",
    "AR": "Argentina", "AS": "American Samoa", "AT": "Austria", "AU": "Australia", "AW": "Aruba",
    "AX": "Åland Islands", "AZ": "Azerbaijan", "BA": "Bosnia and Herzegovina", "BB": "Barbados",
    "BD": "Bangladesh", "BE": "Belgium", "BF": "Burkina Faso", "BG": "Bulgaria", "BH": "Bahrain",
    "BI": "Burundi", "BJ": "Benin", "BL": "Saint Barthélemy", "BM": "Bermuda", "BN": "Brunei",
    "BO": "Bolivia", "BQ": "Caribbean Netherlands", "BR": "Brazil", "BS": "Bahamas", "BT": "Bhutan",
    "BV": "Bouvet Island", "BW": "Botswana", "BY": "Belarus", "BZ": "Belize", "CA": "Canada",
    "CC": "Cocos Islands", "CD": "DR Congo", "CF": "Central African Republic", "CG": "Republic of the Congo",
    "CH": "Switzerland", "CI": "Côte d'Ivoire", "CK": "Cook Islands", "CL": "Chile", "CM": "Cameroon",
    "CN": "China", "CO": "Colombia", "CR": "Costa Rica", "CU": "Cuba", "CV": "Cape Verde",
    "CW": "Curaçao", "CX": "Christmas Island", "CY": "Cyprus", "CZ": "Czechia", "DE": "Germany",
    "DJ": "Djibouti", "DK": "Denmark", "DM": "Dominica", "DO": "Dominican Republic", "DZ": "Algeria",
    "EC": "Ecuador", "EE": "Estonia", "EG": "Egypt", "EH": "Western Sahara", "ER": "Eritrea",
    "ES": "Spain", "ET": "Ethiopia", "FI": "Finland", "FJ": "Fiji", "FK": "Falkland Islands",
    "FM": "Micronesia", "FO": "Faroe Islands", "FR": "France", "GA": "Gabon", "GB": "United Kingdom",
    "GD": "Grenada", "GE": "Georgia", "GF": "French Guiana", "GG": "Guernsey", "GH": "Ghana",
    "GI": "Gibraltar", "GL": "Greenland", "GM": "Gambia", "GN": "Guinea", "GP": "Guadeloupe",
    "GQ": "Equatorial Guinea", "GR": "Greece", "GS": "South Georgia", "GT": "Guatemala", "GU": "Guam",
    "GW": "Guinea-Bissau", "GY": "Guyana", "HK": "Hong Kong", "HM": "Heard Island", "HN": "Honduras",
    "HR": "Croatia", "HT": "Haiti", "HU": "Hungary", "ID": "Indonesia", "IE": "Ireland",
    "IL": "Israel", "IM": "Isle of Man", "IN": "India", "IO": "British Indian Ocean Territory",
    "IQ": "Iraq", "IR": "Iran", "IS": "Iceland", "IT": "Italy", "JE": "Jersey", "JM": "Jamaica",
    "JO": "Jordan", "JP": "Japan", "KE": "Kenya", "KG": "Kyrgyzstan", "KH": "Cambodia",
    "KI": "Kiribati", "KM": "Comoros", "KN": "Saint Kitts and Nevis", "KP": "North Korea",
    "KR": "South Korea", "KW": "Kuwait", "KY": "Cayman Islands", "KZ": "Kazakhstan", "LA": "Laos",
    "LB": "Lebanon", "LC": "Saint Lucia", "LI": "Liechtenstein", "LK": "Sri Lanka", "LR": "Liberia",
    "LS": "Lesotho", "LT": "Lithuania", "LU": "Luxembourg", "LV": "Latvia", "LY": "Libya",
    "MA": "Morocco", "MC": "Monaco", "MD": "Moldova", "ME": "Montenegro", "MF": "Saint Martin",
    "MG": "Madagascar", "MH": "Marshall Islands", "MK": "North Macedonia", "ML": "Mali",
    "MM": "Myanmar", "MN": "Mongolia", "MO": "Macau", "MP": "Northern Mariana Islands", "MQ": "Martinique",
    "MR": "Mauritania", "MS": "Montserrat", "MT": "Malta", "MU": "Mauritius", "MV": "Maldives",
    "MW": "Malawi", "MX": "Mexico", "MY": "Malaysia", "MZ": "Mozambique", "NA": "Namibia",
    "NC": "New Caledonia", "NE": "Niger", "NF": "Norfolk Island", "NG": "Nigeria", "NI": "Nicaragua",
    "NL": "Netherlands", "NO": "Norway", "NP": "Nepal", "NR": "Nauru", "NU": "Niue", "NZ": "New Zealand",
    "OM": "Oman", "PA": "Panama", "PE": "Peru", "PF": "French Polynesia", "PG": "Papua New Guinea",
    "PH": "Philippines", "PK": "Pakistan", "PL": "Poland", "PM": "Saint Pierre and Miquelon",
    "PN": "Pitcairn Islands", "PR": "Puerto Rico", "PS": "Palestine", "PT": "Portugal", "PW": "Palau",
    "PY": "Paraguay", "QA": "Qatar", "RE": "Réunion", "RO": "Romania", "RS": "Serbia", "RU": "Russia",
    "RW": "Rwanda", "SA": "Saudi Arabia", "SB": "Solomon Islands", "SC": "Seychelles", "SD": "Sudan",
    "SE": "Sweden", "SG": "Singapore", "SH": "Saint Helena", "SI": "Slovenia", "SJ": "Svalbard and Jan Mayen",
    "SK": "Slovakia", "SL": "Sierra Leone", "SM": "San Marino", "SN": "Senegal", "SO": "Somalia",
    "SR": "Suriname", "SS": "South Sudan", "ST": "São Tomé and Príncipe", "SV": "El Salvador",
    "SX": "Sint Maarten", "SY": "Syria", "SZ": "Eswatini", "TC": "Turks and Caicos Islands",
    "TD": "Chad", "TF": "French Southern Territories", "TG": "Togo", "TH": "Thailand", "TJ": "Tajikistan",
    "TK": "Tokelau", "TL": "Timor-Leste", "TM": "Turkmenistan", "TN": "Tunisia", "TO": "Tonga",
    "TR": "Turkey", "TT": "Trinidad and Tobago", "TV": "Tuvalu", "TW": "Taiwan", "TZ": "Tanzania",
    "UA": "Ukraine", "UG": "Uganda", "UM": "United States Minor Outlying Islands", "US": "United States",
    "UY": "Uruguay", "UZ": "Uzbekistan", "VA": "Vatican City", "VC": "Saint Vincent and the Grenadines",
    "VE": "Venezuela", "VG": "British Virgin Islands", "VI": "United States Virgin Islands",
    "VN": "Vietnam", "VU": "Vanuatu", "WF": "Wallis and Futuna", "WS": "Samoa", "YE": "Yemen",
    "YT": "Mayotte", "ZA": "South Africa", "ZM": "Zambia", "ZW": "Zimbabwe"
  };
  return countryNames[code] || countryCode;
};

const createWarningTriangleIcon = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  svg.className = "x-provenance-warning-icon";
  svg.style.display = "inline-block";
  svg.style.verticalAlign = "middle";
  
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute("fill-rule", "evenodd");
  path.setAttribute("d", "M14.543 2.598a2.821 2.821 0 0 0-5.086 0L1.341 18.563C.37 20.469 1.597 23 3.883 23h16.234c2.286 0 3.511-2.53 2.542-4.437zM12 8a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0V9a1 1 0 0 1 1-1m0 8.5a1 1 0 0 1 1 1v.5a1 1 0 1 1-2 0v-.5a1 1 0 0 1 1-1");
  path.setAttribute("clip-rule", "evenodd");
  svg.appendChild(path);
  
  return svg;
};

const createVPNBadge = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "40");
  svg.setAttribute("height", "40");
  svg.setAttribute("viewBox", "0 0 100 50");
  svg.className = "x-provenance-vpn-badge";
  svg.style.display = "inline-block";
  svg.style.verticalAlign = "middle";
  
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", "5");
  rect.setAttribute("y", "5");
  rect.setAttribute("width", "90");
  rect.setAttribute("height", "40");
  rect.setAttribute("rx", "10");
  rect.setAttribute("ry", "10");
  rect.setAttribute("fill", "none");
  rect.setAttribute("stroke", "currentColor");
  rect.setAttribute("stroke-width", "4");
  svg.appendChild(rect);
  
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", "50");
  text.setAttribute("y", "28");
  text.setAttribute("fill", "currentColor");
  text.setAttribute("font-family", "Arial, Helvetica, sans-serif");
  text.setAttribute("font-size", "27");
  text.setAttribute("font-weight", "bold");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "middle");
  text.textContent = "VPN";
  svg.appendChild(text);
  
  return svg;
};

const createFlagChip = (entry) => {
  const span = document.createElement("span");
  span.className = FLAG_CLASS;
  span.setAttribute(FLAG_ATTR, "true");
  span.dataset.countryCode = entry.countryCode || "";
  span.dataset.confidence = entry.confidence || "unknown";
  span.dataset.isVpn = entry.isVPN ? "true" : "false";
  span.dataset.regionName = entry.regionName || "";


  if (entry.isVPN && entry.countryCode) {
    const flagEmoji = countryCodeToFlagEmoji(entry.countryCode);
    span.classList.add("x-provenance-vpn");
    const flagSpan = document.createElement("span");
    flagSpan.className = "x-provenance-flag-emoji";
    flagSpan.textContent = flagEmoji;
    span.appendChild(flagSpan);
    span.appendChild(createVPNBadge());
  } else if (entry.isVPN) {
    span.appendChild(createVPNBadge());
  } else if (entry.regionName && !entry.countryCode) {
    span.textContent = `🌐 ${entry.regionName}`;
  } else {
    const flagEmoji = countryCodeToFlagEmoji(entry.countryCode);
    const flagSpan = document.createElement("span");
    flagSpan.className = "x-provenance-flag-emoji";
    flagSpan.textContent = flagEmoji;
    span.appendChild(flagSpan);
  }

  const details = [];
  const basedIn =
    entry.signals?.basedIn ||
    entry.meta?.aboutProfile?.account_based_in ||
    entry.regionName;
  const connectedVia = entry.signals?.connectedVia;
  
  // Use country name if we have a countryCode, otherwise use basedIn or regionName
  const countryName = entry.countryCode 
    ? countryCodeToName(entry.countryCode)
    : (basedIn || entry.regionName || null);
  
  if (countryName) {
    details.push(`Account based in ${countryName}`);
  }
  if (connectedVia) details.push(`Connected via ${connectedVia}`);
  if (entry.isVPN) {
    details.push("VPN/Proxy detected");
  }
  if (entry.confidence === "mismatch" && connectedVia) {
    details.push("⚠️ Country mismatch detected");
  }
  span.title = details.join("\n") || (entry.countryCode ? `Account based in ${countryCodeToName(entry.countryCode)}` : "Unknown location");

  return span;
};

const extractHandleFromUserNode = (node) => {
  if (!node) return null;

  const anchor = node.querySelector('a[href]') || node.closest('a[href]');
  const href = anchor?.getAttribute("href");
  if (href) {
    try {
      const url = href.startsWith("http")
        ? new URL(href)
        : new URL(href, window.location.origin);
      const path = url.pathname.replace(/^\/+/, "");
      if (path) {
        const [candidate] = path.split("/");
        if (candidate && candidate !== "i") return candidate;
      }
    } catch {
      // ignored
    }
  }

  const textMatch = node.textContent?.match(/@([A-Za-z0-9_]{1,15})/);
  return textMatch ? textMatch[1] : null;
};

const getEntryForHandle = (rawHandle) => {
  const normalized = normalizeHandle(rawHandle);
  if (!normalized) return null;
  const userId = handleToUserIdMap.get(normalized);
  if (userId) return userGeoMap.get(userId) || null;

  for (const entry of userGeoMap.values()) {
    if (entry.handle === normalized) return entry;
  }
  return null;
};

const resolveUsernameNode = (node) => {
  if (!node) return null;
  if (node.matches(USERNAME_SELECTOR)) return node;

  const fallback = node.querySelector(USERNAME_SELECTOR);
  if (fallback) return fallback;

  return node.closest(USERNAME_SELECTOR);
};

const renderFlags = () => {
  const nodes = document.querySelectorAll(USERNAME_SELECTOR);
  nodes.forEach((node) => {
    const targetNode = resolveUsernameNode(node);
    if (!targetNode) return;

    const handle = extractHandleFromUserNode(targetNode);
    const entry = handle ? getEntryForHandle(handle) : null;
    const existing = targetNode.querySelector(`.${FLAG_CLASS}`);

    if (!entry) {
      if (existing) existing.remove();
      return;
    }


    if (
      existing &&
      existing.dataset.countryCode === entry.countryCode &&
      existing.dataset.regionName === (entry.regionName || "") &&
      existing.dataset.isVpn === (entry.isVPN ? "true" : "false") &&
      existing.dataset.confidence === (entry.confidence || "unknown")
    ) {
      return;
    }
    if (existing) existing.remove();

    const chip = createFlagChip(entry);
    targetNode.appendChild(chip);
  });
};

const scheduleRender = () => {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderFlags();
  });
};

const ensureObserver = () => {
  if (observerStarted) return;

  const start = () => {
    if (!document.body) {
      requestAnimationFrame(start);
      return;
    }

    observerStarted = true;
    const observer = new MutationObserver(scheduleRender);
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleRender();
  };

  start();
};

const cacheGeoPayload = (payload) => {
  const {
    userId,
    handle,
    countryCode,
    regionName = null,
    signalType = "UNKNOWN",
    confidence = "unknown",
    signals = {},
    isVPN,
    meta = {}
  } = payload || {};

  if (!userId || (!countryCode && !regionName)) return;

  const normalizedHandle =
    normalizeHandle(handle) ||
    normalizeHandle(meta?.aboutProfile?.username) ||
    null;

  const existing = userGeoMap.get(userId);
  const entry = {
    userId,
    handle: normalizedHandle || existing?.handle || null,
    countryCode,
    regionName: regionName || existing?.regionName || null,
    signalType,
    confidence: confidence || existing?.confidence || "unknown",
    signals: signals || existing?.signals || {},
    // Always use the new isVPN value if provided (even if false), otherwise fall back to existing
    isVPN: payload && 'isVPN' in payload ? isVPN : (existing?.isVPN || false),
    meta,
    cachedAt: Date.now()
  };

  userGeoMap.set(userId, entry);
  if (entry.handle) handleToUserIdMap.set(entry.handle, userId);
  persistGeoEntry(entry);

  const locationLabel = entry.countryCode || entry.regionName || "Unknown";
  const aboutProfile = entry.meta?.aboutProfile || {};
  scheduleRender();
};

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const { type, payload } = event.data || {};
  if (type !== "X_GEO_FOUND") return;
  cacheGeoPayload(payload);
});

injectFlagStyles();
restorePersistedGeoEntries();
ensureObserver();


# int-x

Reveal how diverse your timeline really is! A Chrome Extension that displays country flags and VPN indicators next to X.com (Twitter) usernames to show the geographic origin of accounts.

## Installation

### From Source

1. **Clone or download this repository**
2. **Open Chrome** and go to `chrome://extensions/`
3. **Enable "Developer mode"** (toggle in top-right)
4. **Click "Load unpacked"** and select the `int-x` folder
5. **Done!** The extension is now active

## How to Use

1. **Browse X.com** as you normally would
2. **Hover over the "Joined" date** on any profile - this triggers geo data extraction
3. **Flags will automatically appear** next to usernames throughout the site

**Note**: You don't need to click into the About page. Simply hovering over the "Joined" date is enough to activate the extension for that account.

## What the Icons Mean

- **🇺🇸 Country Flag**: Account is based in the displayed country
- **🌐 Globe Icon**: Account is based in a region (no specific country available)
- **VPN Badge**: Account is using a VPN or proxy service
- **🇺🇸 VPN Badge**: Account is based in a country but using VPN/proxy

### Tooltips

Hover over any flag badge to see:
- "Account based in [Country Name]" (e.g., "Account based in Australia")
- VPN/proxy status if applicable

## Notes

- Flags only appear for accounts where X.com has geo data available
- VPN detection is based on X.com's internal signals and may not be 100% accurate
- All processing happens locally in your browser - no data is sent anywhere

## Privacy

- No data collection
- No external requests
- All data processed locally
- No tracking or analytics

---

**Not affiliated with X.com (Twitter)**

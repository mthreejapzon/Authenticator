/**
 * Enhanced Icon Recognition System
 * Supports 100+ popular services with fuzzy matching
 */

import * as icons from "simple-icons";

// Type for icon data
export type IconData = {
  type: "simple-icon" | "initials" | "emoji";
  value: any; // simple-icon object, initials string, or emoji
  color?: string;
  name: string;
};

/**
 * Smart provider matching with fuzzy logic
 * Returns simple-icons data or fallback
 */
export function getProviderIcon(accountName: string): IconData {
  if (!accountName || accountName.trim().length === 0) {
    return {
      type: "initials",
      value: "??",
      color: "#9E9E9E",
      name: "Unknown",
    };
  }

  const normalized = accountName.toLowerCase().trim();
  
  // Try exact and fuzzy matching
  const iconKey = findIconKey(normalized);
  
  if (iconKey) {
    const icon = (icons as any)[iconKey];
    return {
      type: "simple-icon",
      value: icon,
      color: `#${icon.hex}`,
      name: accountName,
    };
  }

  // Check for emoji patterns (optional fun feature)
  const emoji = getEmojiForProvider(normalized);
  if (emoji) {
    return {
      type: "emoji",
      value: emoji,
      name: accountName,
    };
  }

  // Fallback to initials with color
  const initials = accountName
    .replace(/[^A-Za-z0-9]/g, "")
    .substring(0, 2)
    .toUpperCase() || "??";
  
  const color = generateColorFromString(accountName);

  return {
    type: "initials",
    value: initials,
    color,
    name: accountName,
  };
}

/**
 * Find matching simple-icon key with fuzzy logic
 */
function findIconKey(normalized: string): string | null {
  // Direct mappings for popular services (handles variations)
  const mappings: Record<string, string> = {
    // Google ecosystem
    "google": "siGoogle",
    "gmail": "siGmail",
    "google drive": "siGoogledrive",
    "google cloud": "siGooglecloud",
    "youtube": "siYoutube",
    
    // Microsoft
    "microsoft": "siMicrosoft",
    "outlook": "siMicrosoftoutlook",
    "office": "siMicrosoftoffice",
    "azure": "siMicrosoftazure",
    "onedrive": "siOnedrive",
    "teams": "siMicrosoftteams",
    
    // Social
    "facebook": "siFacebook",
    "instagram": "siInstagram",
    "twitter": "siTwitter",
    "x": "siX",
    "linkedin": "siLinkedin",
    "tiktok": "siTiktok",
    "snapchat": "siSnapchat",
    "reddit": "siReddit",
    "pinterest": "siPinterest",
    "whatsapp": "siWhatsapp",
    "telegram": "siTelegram",
    "discord": "siDiscord",
    "slack": "siSlack",
    
    // Development
    "github": "siGithub",
    "gitlab": "siGitlab",
    "bitbucket": "siBitbucket",
    "stackoverflow": "siStackoverflow",
    "npm": "siNpm",
    "docker": "siDocker",
    "kubernetes": "siKubernetes",
    "vercel": "siVercel",
    "netlify": "siNetlify",
    
    // Cloud & Storage
    "amazon": "siAmazon",
    "aws": "siAmazonaws",
    "dropbox": "siDropbox",
    "icloud": "siIcloud",
    
    // Finance
    "paypal": "siPaypal",
    "stripe": "siStripe",
    "coinbase": "siCoinbase",
    "binance": "siBinance",
    "revolut": "siRevolut",
    
    // Productivity
    "notion": "siNotion",
    "trello": "siTrello",
    "asana": "siAsana",
    "jira": "siJira",
    "confluence": "siConfluence",
    "evernote": "siEvernote",
    
    // Entertainment
    "spotify": "siSpotify",
    "netflix": "siNetflix",
    "twitch": "siTwitch",
    "steam": "siSteam",
    "playstation": "siPlaystation",
    "xbox": "siXbox",
    "nintendo": "siNintendo",
    
    // E-commerce
    "shopify": "siShopify",
    "ebay": "siEbay",
    "etsy": "siEtsy",
    
    // Crypto
    "metamask": "siMetamask",
    "ethereum": "siEthereum",
    "bitcoin": "siBitcoin",
    
    // Apple
    "apple": "siApple",
    
    // Adobe
    "adobe": "siAdobe",
    "photoshop": "siAdobephotoshop",
    "illustrator": "siAdobeillustrator",
    
    // Others
    "zoom": "siZoom",
    "figma": "siFigma",
    "canva": "siCanva",
    "mailchimp": "siMailchimp",
    "wordpress": "siWordpress",
    "medium": "siMedium",
  };

  // Check direct mapping
  if (mappings[normalized]) {
    return mappings[normalized];
  }

  // Fuzzy matching - check if normalized contains any key
  for (const [key, value] of Object.entries(mappings)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  // Try simple-icons format directly
  const formatted = normalized.replace(/\s+/g, "");
  const iconKey = `si${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}`;
  
  if ((icons as any)[iconKey]) {
    return iconKey;
  }

  return null;
}

/**
 * Optional: Get emoji for common services (fun alternative)
 */
function getEmojiForProvider(normalized: string): string | null {
  const emojiMap: Record<string, string> = {
    "google": "🔍",
    "email": "📧",
    "mail": "📧",
    "bank": "🏦",
    "crypto": "₿",
    "bitcoin": "₿",
    "wallet": "💰",
    "game": "🎮",
    "shopping": "🛒",
    "music": "🎵",
    "video": "🎬",
    "cloud": "☁️",
    "server": "🖥️",
    "vpn": "🔒",
  };

  for (const [key, emoji] of Object.entries(emojiMap)) {
    if (normalized.includes(key)) {
      return emoji;
    }
  }

  return null;
}

/**
 * Generate consistent color from string (for initials background)
 */
function generateColorFromString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Generate pleasant colors (avoid too dark or too light)
  const hue = Math.abs(hash % 360);
  const saturation = 65 + (Math.abs(hash) % 20); // 65-85%
  const lightness = 55 + (Math.abs(hash) % 15); // 55-70%

  return hslToHex(hue, saturation, lightness);
}

/**
 * Convert HSL to HEX color
 */
function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Get all available provider names (for autocomplete/suggestions)
 */
export function getPopularProviders(): string[] {
  return [
    "Google",
    "GitHub",
    "Facebook",
    "Twitter",
    "Instagram",
    "LinkedIn",
    "Discord",
    "Slack",
    "Microsoft",
    "Apple",
    "Amazon",
    "Netflix",
    "Spotify",
    "Dropbox",
    "PayPal",
    "Stripe",
    "Notion",
    "Trello",
    "Figma",
    "Zoom",
    // Add more as needed
  ].sort();
}

/**
 * Search providers (for autocomplete)
 */
export function searchProviders(query: string): string[] {
  const popular = getPopularProviders();
  const normalized = query.toLowerCase();
  
  return popular.filter(provider =>
    provider.toLowerCase().includes(normalized)
  );
}

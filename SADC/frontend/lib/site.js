// What a shared link shows (Discord, X, iMessage…): title, description and the preview image.
// These are baked into the page when it's built, so they can't come from the backend like the rest of the page.

export const COLLECTION = "Ted Trading Club";
export const TITLE = `${COLLECTION} holder verification`;
export const DESCRIPTION = `Link your Discord and Solana wallet to get the ${COLLECTION} holder role. Free to verify, no transaction.`;

// The site's own address, for the preview image link. Netlify sets URL during its build; SITE_URL overrides it.
export const SITE_URL = process.env.SITE_URL || process.env.URL || "http://localhost:2000";

// The side bar colour of the Discord embed, and the browser bar on phones.
export const BRAND = "#1A56F0";

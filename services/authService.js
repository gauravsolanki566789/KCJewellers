// ============================================
// AUTH SERVICE - Super Admin & Role Enforcement
// Gaurav Softwares - Jewelry Estimation
// ============================================

const SUPER_ADMIN_EMAIL = 'jaigaurav56789@gmail.com';

/** Whitelisted Google emails with full KC admin (sync with client `admin-access.ts`). */
const SUPER_ADMIN_EMAILS = [
    'jaigaurav56789@gmail.com',
    '22btrsn018@jainuniversity.ac.in',
];

function normalizeLoginEmail(email) {
    return String(email || '').toLowerCase().trim();
}

/**
 * Resolve user role based on hardcoded Super Admin check.
 * - Whitelisted super-admin emails → always 'super_admin' with ['all'] allowed_tabs
 * - All others → always 'customer' (admin access denied)
 * @param {Object} user - User object from DB
 * @returns {Object} User with role forced
 */
function resolveUserRole(user) {
    if (!user) return null;
    const email = normalizeLoginEmail(user.email);
    // OTP-only users have no email; always customer
    if (!email) {
        return { ...user, role: 'customer', allowed_tabs: user.allowed_tabs || [] };
    }
    
    if (isSuperAdmin(email)) {
        // Strict override: Force super_admin role and all tabs access
        return { 
            ...user, 
            role: 'super_admin',
            allowed_tabs: ['all'],
            account_status: user.account_status || 'active',
            customer_tier: 'ADMIN',
        };
    }
    // Deny admin access to everyone else - force customer role
    return { 
        ...user, 
        role: 'customer',
        allowed_tabs: user.allowed_tabs || []
    };
}

/**
 * Check if email is a whitelisted Super Admin
 * @param {string} email
 * @returns {boolean}
 */
function isSuperAdmin(email) {
    const normalized = normalizeLoginEmail(email);
    return SUPER_ADMIN_EMAILS.some((e) => normalizeLoginEmail(e) === normalized);
}

/** Customer tier values — consistent with DB `users.customer_tier` and Prisma `CustomerTier`. */
const CUSTOMER_TIER = {
    ADMIN: 'ADMIN',
    B2C_CUSTOMER: 'B2C_CUSTOMER',
    B2B_WHOLESALE: 'B2B_WHOLESALE',
    RESELLER: 'RESELLER',
};

/**
 * Catalogue wholesale pricing (product cards, cart, checkout UI) — B2B, ADMIN, RESELLER, or super-admin email.
 * @param {Object|null} user - user row or session user
 */
function hasWholesaleCatalogAccess(user) {
    if (!user) return false;
    const email = String(user.email || '').toLowerCase().trim();
    if (isSuperAdmin(email)) return true;
    const tier = String(user.customer_tier || CUSTOMER_TIER.B2C_CUSTOMER).toUpperCase();
    return (
        tier === CUSTOMER_TIER.B2B_WHOLESALE ||
        tier === CUSTOMER_TIER.ADMIN ||
        tier === CUSTOMER_TIER.RESELLER
    );
}

/**
 * B2B portal only: client ledger, wholesale quick-order flows, `/api/checkout/b2b-create-order`.
 * Excludes `RESELLER` (white-label catalogue / pricing only).
 */
function hasB2bWholesalePortalAccess(user) {
    if (!user) return false;
    const email = String(user.email || '').toLowerCase().trim();
    if (isSuperAdmin(email)) return true;
    const tier = String(user.customer_tier || CUSTOMER_TIER.B2C_CUSTOMER).toUpperCase();
    return tier === CUSTOMER_TIER.B2B_WHOLESALE || tier === CUSTOMER_TIER.ADMIN;
}

module.exports = {
    SUPER_ADMIN_EMAIL,
    SUPER_ADMIN_EMAILS,
    normalizeLoginEmail,
    resolveUserRole,
    isSuperAdmin,
    CUSTOMER_TIER,
    hasWholesaleCatalogAccess,
    hasB2bWholesalePortalAccess,
};

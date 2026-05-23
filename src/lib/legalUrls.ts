/**
 * Centralised external URLs for legal / informational pages. Lives
 * in a single module so a marketing change (privacy page moved to
 * Notion, terms moved to a hosted-on-Vercel doc, etc.) is a one-
 * line edit instead of a grep-and-replace across the codebase.
 *
 * Consumers: AccountScreen, SignInScreen, WelcomeScreen, and
 * anywhere else legal links land.
 */

export const PRIVACY_POLICY_URL = 'https://getbookflow.co/privacy';
export const TERMS_OF_SERVICE_URL = 'https://getbookflow.co/terms';
/**
 * Deep link to the in-policy "How to delete your account" section.
 * Google Play Console requires a dedicated, publicly reachable URL
 * for account deletion (Data Safety form). Pointing at this anchor
 * keeps the requirement satisfied without a second standalone page.
 */
export const DELETE_ACCOUNT_URL = 'https://getbookflow.co/privacy#delete-account';
/**
 * Student-verification page handled off-app by a third-party
 * (SheerID etc). Returned coupon is applied to the Standard plan
 * checkout when the user returns and refreshes their RC entitlement.
 *
 * NOTE: not yet live — student tier ships post-launch. Until then,
 * any caller using this URL will 404. Guard it at the call site.
 */
export const STUDENT_VERIFICATION_URL = 'https://getbookflow.co/student';
/**
 * Mailto target for the "Send feedback" surface in the You tab.
 * Compose-with-subject is built at the call site since the body
 * varies per send.
 */
export const SUPPORT_EMAIL = 'support@getbookflow.co';

/**
 * Firefox-only manifest values (T06.6 / D-46).
 *
 * One source for the build script and its audit. The Gecko ID is the
 * extension's permanent AMO identity: AMO does not assign one for MV3,
 * and changing it after the first submission would create a new add-on.
 */
export const GECKO_ID = 'bozkhar@sudoscratchy.github.io';

/** Firefox 140 is the first release with the data-collection consent UI. */
export const STRICT_MIN_VERSION = '140.0';

/**
 * The click-only Torob lookup sends the public product title to
 * api.torob.com, which AMO classifies as website content. Nothing else
 * leaves the browser: the GitHub check sends no user data.
 */
export const DATA_COLLECTION_REQUIRED = ['websiteContent'];

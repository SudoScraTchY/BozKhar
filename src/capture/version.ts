/**
 * Extractor versioning (SDD 08 "Identity, versioning, migration", NFR-05).
 *
 * Every Offer/Snapshot stamps the extractor version that produced it so
 * stale captures can be warned about (FR-04) and re-capture can be offered.
 * Bump on any reader/normalizer behavior change.
 */
export const EXTRACTOR_VERSION = '0.3.0-t03';

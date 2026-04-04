export const allianceTagOptions = ["HEL", "PNX", "SKY", "VIK", "SIN", "HTS", "MED", "OTHER"] as const;

export type AllianceTag = (typeof allianceTagOptions)[number];

declare module 'sworn-verifier' {
  export interface ManifestDecision {
    url: string;
    configured: boolean;
    fetched_at: string;
    status_code: number;
    allow: boolean;
    reason: string;
    spec_version?: string;
    stripped_hash?: string;
  }
  export function evaluateManifest(url: string, opts?: { timeoutMs?: number }): Promise<ManifestDecision>;
  export function evaluateManifestObject(obj: Record<string, unknown>): { allow: boolean; reason: string; spec_version?: string; stripped_hash?: string };
  export function canonicalJSON(obj: Record<string, unknown>): string;
  export function strippedHash(obj: Record<string, unknown>): string;
  export const KNOWN_SPEC_VERSIONS: Set<string>;
  export const REQUIRED_FIELDS: string[];
}

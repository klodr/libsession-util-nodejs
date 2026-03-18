/// <reference path="../shared.d.ts" />;

declare module 'libsession_util_nodejs' {
  type WithProRotatingEd25519PrivKey = { proRotatingEd25519PrivKey: string | null };

  type WithProBackendPubkey = {
    /**
     * HexString
     */
    proBackendPubkeyHex: string;
  };

  type ProStatus = 'ValidOrExpired' | 'Invalid';
  type WithProProfileBitset = { proProfileBitset: bigint };
  type WithProMessageBitset = { proMessageBitset: bigint };
  type WithGenIndexHash = { genIndexHashB64: string };

  type WithRequestVersion = { requestVersion: number };
  type WithTicket = { ticket: number };

  type WithUnixTsMs = {
    unixTsMs: number;
  };

  type ProProof = WithGenIndexHash & {
    version: number;
    /**
     * HexString, 64 chars
     */
    rotatingPubkeyHex: string;
    expiryMs: number;
    /**
     * signature of the pro proof provided by the backend (hex)
     * 64 bytes, 128 chars
     */
    signatureHex: string;
  };

  type WithRotatingPrivKeyHex = {
    /**
     * 64 bytes, 128 chars
     */
    rotatingPrivKeyHex: string;
  };

  type WithRotatingSeedHex = {
    /**
     * 32 bytes, 64 chars
     */
    rotatingSeedHex: string;
  };

  type ProConfig = WithRotatingPrivKeyHex & {
    proProof: ProProof;
  };

  type ProConfigSet = WithRotatingSeedHex & {
    proProof: Omit<ProProof, 'rotatingPubkeyHex'>;
  };

  export type ProOriginatingPlatform = 'Nil' | 'Google' | 'iOS' | 'Rangeproof';

  export type ProBackendProviderConstantType = {
    device: string;
    store: string;
    store_other: string;
    platform: string;
    platform_account: string;
    refund_support_url: string;
    refund_status_url: string;
    refund_platform_url: string;
    update_subscription_url: string;
    cancel_subscription_url: string;
  };

  export type ProBackendProviderConstantsType = Record<
    ProOriginatingPlatform,
    ProBackendProviderConstantType
  >;

  export type ProBackendUrlsType = {
    roadmap: string;
    privacy_policy: string;
    terms_of_service: string;
    pro_access_not_found: string;
    support_url: string;
  };

  type ProRevocationItem = WithGenIndexHash & {
    expiryUnixTsMs: number;
  };

  type WithMasterPrivKeyHex = { masterPrivKeyHex: string };


  type ProWrapper = {
    proFeaturesForMessage: (args: { utf16: string }) => WithProMessageBitset & {
      status: 'SUCCESS' | 'UTF_DECODING_ERROR' | 'EXCEEDS_CHARACTER_LIMIT';
    };
    utf16Count: (args: { utf16: string }) => { codepointCount: number };
    utf16CountTruncatedToCodepoints: (args: { utf16: string; codepointLen: number }) => {
      truncateAt: number;
    };

    proProofRequestBody: (
      args: WithMasterPrivKeyHex & WithRequestVersion & WithUnixTsMs & WithRotatingPrivKeyHex
    ) => string;

    /**
     * @param version: Request version. The latest accepted version is 0
     * @param ticket: 4-byte monotonic integer for the caller's revocation list iteration. Set to 0 if unknown; otherwise, use the latest known `ticket` from a prior `GetProRevocationsResponse` to allow
     the Session Pro Backend to omit the revocation list if it has not changed.
     * @returns the stringified body to include in the request
     */
    proRevocationsRequestBody: (args: WithRequestVersion & WithTicket) => string;

    proStatusRequestBody: (
      args: WithMasterPrivKeyHex &
        WithRequestVersion &
        WithUnixTsMs & {
          count: number;
        }
    ) => string;
  };

  export type ProActionsCalls = MakeWrapperActionCalls<ProWrapper>;

  /**
   * To be used inside the web worker only (calls are synchronous and won't work asynchronously)
   */
  export class ProWrapperNode {
    public static proFeaturesForMessage: ProWrapper['proFeaturesForMessage'];
    public static utf16Count: ProWrapper['utf16Count'];
    public static utf16CountTruncatedToCodepoints: ProWrapper['utf16CountTruncatedToCodepoints'];
    public static proProofRequestBody: ProWrapper['proProofRequestBody'];
    public static proRevocationsRequestBody: ProWrapper['proRevocationsRequestBody'];
    public static proStatusRequestBody: ProWrapper['proStatusRequestBody'];
  }

  /**
   * Those actions are used internally for the web worker communication.
   * You should never need to import them in Session directly
   * You will need to add an entry here if you add a new function
   */
  export type ProActionsType =
    | MakeActionCall<ProWrapper, 'proFeaturesForMessage'>
    | MakeActionCall<ProWrapper, 'utf16Count'>
    | MakeActionCall<ProWrapper, 'utf16CountTruncatedToCodepoints'>
    | MakeActionCall<ProWrapper, 'proProofRequestBody'>
    | MakeActionCall<ProWrapper, 'proRevocationsRequestBody'>
    | MakeActionCall<ProWrapper, 'proStatusRequestBody'>;
}

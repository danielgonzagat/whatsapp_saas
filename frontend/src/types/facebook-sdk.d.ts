export {};

declare global {
  interface FacebookAuthResponse {
    accessToken?: string;
    expiresIn?: number;
    signedRequest?: string;
    userID?: string;
  }

  interface FacebookStatusResponse {
    status: 'connected' | 'not_authorized' | 'unknown';
    authResponse?: FacebookAuthResponse;
  }

  interface Window {
    FB?: {
      init: (options: {
        appId: string;
        cookie?: boolean;
        xfbml?: boolean;
        version: string;
      }) => void;
      getLoginStatus: (callback: (response: FacebookStatusResponse) => void) => void;
      login: (
        callback: (response: FacebookStatusResponse) => void,
        options?: {
          scope?: string;
          return_scopes?: boolean;
        },
      ) => void;
    };
    fbAsyncInit?: (() => void) | undefined;
  }

  const FB: Window['FB'];
}

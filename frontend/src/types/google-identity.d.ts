export {};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string; select_by?: string }) => void;
            ux_mode?: 'popup' | 'redirect';
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: number;
            },
          ) => void;
          disableAutoSelect?: () => void;
        };
        oauth2: {
          initTokenClient: (options: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              error?: string;
              error_description?: string;
              scope?: string;
            }) => void;
          }) => {
            callback: (response: {
              access_token?: string;
              error?: string;
              error_description?: string;
              scope?: string;
            }) => void;
            requestAccessToken: (options?: {
              prompt?: '' | 'consent' | 'select_account' | 'none';
              hint?: string;
              scope?: string;
            }) => void;
          };
        };
      };
    };
  }
}

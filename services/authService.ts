
// Global types for Google APIs
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

// Fallback constant - valid if hardcoded, ignored if passed dynamically
export const HARDCODED_CLIENT_ID = 'YOUR_CLIENT_ID_STRING_HERE'; 

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

// Resolver for silent auth promise - allows callback to signal completion
let silentAuthResolver: ((success: boolean) => void) | null = null;

export const initGoogleClient = async (
  clientId: string, 
  updateSigninStatus: (signedIn: boolean) => void
): Promise<boolean> => {
  const sanitizedClientId = clientId.trim();
  console.log("Initializing Google Client...", { origin: window.location.origin });

  return new Promise<boolean>((resolve) => {
    const gapiLoadPromise = new Promise<void>((resolveGapi) => {
      if (!window.gapi) {
        console.error("GAPI not found");
        resolveGapi();
        return;
      }
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({
            discoveryDocs: [DISCOVERY_DOC],
          });
          gapiInited = true;
          resolveGapi();
        } catch (err) {
          console.error("GAPI Init Error", err);
          resolveGapi(); 
        }
      });
    });

    const gisLoadPromise = new Promise<void>((resolveGis) => {
      if (!window.google) {
        console.error("Google GIS not found");
        resolveGis();
        return;
      }
      try {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: sanitizedClientId,
          scope: SCOPES,
          callback: (resp: any) => {
            if (resp.error !== undefined) {
              console.warn("Auth Error or Silent Auth Failed", resp);
              // Signal silent auth completed (but failed)
              if (silentAuthResolver) {
                silentAuthResolver(false);
                silentAuthResolver = null;
              }
              return;
            }
            
            // Save token to localStorage for persistence
            const expiresIn = resp.expires_in; // seconds
            // Set expiry time (subtract 60s for buffer)
            const expiresAt = Date.now() + (expiresIn * 1000) - 60000; 
            const tokenWithExpiry = { ...resp, expires_at: expiresAt };
            localStorage.setItem('google_access_token', JSON.stringify(tokenWithExpiry));

            // CRITICAL: Pass the token to gapi.client to authorize requests
            if (window.gapi && window.gapi.client) {
              window.gapi.client.setToken(resp);
            }
            updateSigninStatus(true);

            // Signal silent auth completed successfully
            if (silentAuthResolver) {
              silentAuthResolver(true);
              silentAuthResolver = null;
            }
          },
        });
        gisInited = true;
        resolveGis();
      } catch (err) {
        console.error("GIS Init Error", err);
        resolveGis(); 
      }
    });

    Promise.all([gapiLoadPromise, gisLoadPromise]).then(async () => {
      // 1. Try to restore from localStorage first (Instant)
      const stored = localStorage.getItem('google_access_token');
      let restored = false;

      if (stored) {
        try {
          const tokenObj = JSON.parse(stored);
          if (Date.now() < tokenObj.expires_at) {
            if (window.gapi && window.gapi.client) {
              window.gapi.client.setToken(tokenObj);
              updateSigninStatus(true);
              restored = true;
              console.log("Session restored from storage");
              resolve(true);
              return;
            }
          } else {
            localStorage.removeItem('google_access_token'); // Expired
          }
        } catch (e) {
          console.error("Failed to parse stored token", e);
          localStorage.removeItem('google_access_token');
        }
      }

      // 2. If not restored, try silent auth via Google (Async)
      if (!restored && tokenClient) {
        try {
          // Create a promise that will be resolved by the callback
          const silentAuthPromise = new Promise<boolean>((resolveSilent) => {
            silentAuthResolver = resolveSilent;
          });

          // Set a timeout to prevent indefinite waiting (3 seconds)
          const timeoutPromise = new Promise<boolean>((resolveTimeout) => {
            setTimeout(() => {
              console.log("Silent auth timed out");
              if (silentAuthResolver) {
                silentAuthResolver = null; // Clear resolver so callback doesn't fire late
              }
              resolveTimeout(false);
            }, 3000);
          });

          // Initiate silent sign-in (prompt: 'none' = no UI, just check existing session)
          console.log("Attempting silent sign-in...");
          tokenClient.requestAccessToken({ prompt: 'none' });

          // Wait for either the callback or timeout
          const success = await Promise.race([silentAuthPromise, timeoutPromise]);
          resolve(success);
          return;
        } catch (e) {
          console.log("Silent auth request failed", e);
        }
      }

      // No session found
      resolve(false);
    });
  });
};

export const handleAuthClick = () => {
  if (tokenClient) {
    // Request access token with default prompt (allows account chooser/consent if needed)
    tokenClient.requestAccessToken({ prompt: '' });
  } else {
    console.error("Token Client not initialized");
    alert("Authentication service not initialized.");
  }
};

export const handleSignOut = () => {
  const token = window.gapi?.client?.getToken();
  if (token !== null) {
    try {
      window.google?.accounts?.oauth2?.revoke(token.access_token);
    } catch(e) { console.warn("Revoke failed", e); }
    
    window.gapi?.client?.setToken('');
    localStorage.removeItem('google_access_token');
  }
};

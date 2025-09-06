/**
 * Authentication helper for API routes
 * Uses bearer token validation
 */

export interface AuthError {
  error: string;
  status: number;
}

/**
 * Validate bearer token from request headers
 */
export function requireAuth(request: Request): AuthError | null {
  const authToken = process.env.API_AUTH_TOKEN;
  
  if (!authToken) {
    console.error('API_AUTH_TOKEN not configured');
    return {
      error: 'Authentication not configured',
      status: 500
    };
  }

  const authHeader = request.headers.get('authorization');
  
  if (!authHeader) {
    return {
      error: 'Missing authorization header',
      status: 401
    };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return {
      error: 'Invalid authorization format. Expected: Bearer <token>',
      status: 401
    };
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  if (token !== authToken) {
    return {
      error: 'Invalid authentication token',
      status: 401
    };
  }

  return null; // Auth successful
}

/**
 * Create error response for authentication failures
 */
export function createAuthErrorResponse(authError: AuthError): Response {
  return new Response(
    JSON.stringify({ error: authError.error }),
    {
      status: authError.status,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}

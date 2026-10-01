/**
 * Standard API response helpers
 */

export function jsonResponse(res, statusCode = 200, data = {}, message = 'Success') {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    success: true,
    data,
    message,
  }));
}

export function errorResponse(res, statusCode = 400, error = 'An error occurred', details = null) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  const payload = {
    success: false,
    error,
  };
  if (details && process.env.NODE_ENV !== 'production') {
    payload.details = details;
  }
  res.end(JSON.stringify(payload));
}

# MSG91 OTP Integration - Backend

This document describes the MSG91 OTP verification integration in the Namma Naidu Backend API.

## Overview

The MSG91 OTP service has been integrated into the backend to verify OTP tokens received from the MSG91 OTP widget. This allows for secure OTP verification using MSG91's verification API on the server side.

## Configuration

### Constants (in `src/services/msg91.service.js`)
- **Auth Key**: `489428AGbdetF92za69723550P1`
- **Widget ID**: `366174697953393937363533`
- **Base URL**: `https://control.msg91.com`
- **Verify Endpoint**: `/api/v5/widget/verifyAccessToken`

## Implementation Details

### 1. MSG91 Service
**File**: `src/services/msg91.service.js`

This service handles:
- Verifying MSG91 access tokens using the `verifyAccessToken` API
- Error handling and response parsing
- Returns a promise with verification results

**Key Method**:
```javascript
const verifyAccessToken = async (accessToken) => {
  // Returns: { success: boolean, message?: string, data?: object }
}
```

### 2. Auth Controller Integration
**File**: `src/modules/auth/auth.controller.js`

#### Updated `verifyOtp` function:
- Now accepts optional `msg91AccessToken` parameter
- If `msg91AccessToken` is provided, verifies with MSG91 first
- Then proceeds with standard OTP verification

#### New `verifyMsg91Token` function:
- Standalone endpoint for MSG91 token verification
- Returns verification result directly

### 3. API Endpoints

#### Updated: POST `/api/auth/otp/verify`
**Request Body**:
```json
{
  "mobileno": "+919876543210",
  "otp": "123456",
  "isemailid": false,
  "msg91AccessToken": "jwt_token_from_msg91_widget" // Optional
}
```

**Response**:
```json
{
  "status": true,
  "response": "Verified Successfully"
}
```

#### New: POST `/api/auth/msg91/verify-token`
**Request Body**:
```json
{
  "accessToken": "jwt_token_from_msg91_widget"
}
```

**Response**:
```json
{
  "status": true,
  "response": "MSG91 token verified successfully",
  "data": {
    "type": "success",
    "message": "OTP verified successfully",
    "mobile": "+919876543210",
    "email": null
  }
}
```

## Flow

### Standard OTP Flow
1. User enters mobile number
2. Backend generates and stores OTP
3. User enters OTP
4. Backend verifies OTP

### MSG91 OTP Flow
1. MSG91 widget sends OTP and returns access token
2. Client sends OTP and access token to backend
3. Backend verifies token with MSG91 API first
4. If MSG91 verification succeeds, proceed with standard OTP verification
5. Return success response

## Usage Examples

### Using MSG91 Token in OTP Verification

```javascript
// Frontend/Mobile App
const response = await fetch('/api/auth/otp/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    mobileno: '+919876543210',
    otp: '123456',
    isemailid: false,
    msg91AccessToken: 'jwt_token_from_msg91_widget', // Optional
  }),
});
```

### Standalone MSG91 Token Verification

```javascript
// Frontend/Mobile App
const response = await fetch('/api/auth/msg91/verify-token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    accessToken: 'jwt_token_from_msg91_widget',
  }),
});
```

## Error Handling

The service handles:
- Network timeouts (30 seconds)
- Connection errors
- Invalid tokens
- API errors
- Malformed responses

All errors are returned with appropriate error messages in the response.

## MSG91 Widget Integration (Web)

For web integration, use the MSG91 widget script:

```html
<script type="text/javascript">
var configuration = {
  widgetId: "366174697953393937363533",
  tokenAuth: "{token}",
  identifier: "<enter mobile number/email here> (optional)",
  exposeMethods: "<true | false> (optional)",
  success: (data) => {
      // Get verified token in response
      console.log('success response', data);
      // Use data.accessToken for backend verification
      // Send to: POST /api/auth/otp/verify with msg91AccessToken
  },
  failure: (error) => {
      console.log('failure reason', error);
  },
};
</script>
<script type="text/javascript">
(function loadOtpScript(urls) {
    let i = 0;
    function attempt() {
        const s = document.createElement('script');
        s.src = urls[i];
        s.async = true;
        s.onload = () => {
            if (typeof window.initSendOTP === 'function') {
                window.initSendOTP(configuration);
            }
        };
        s.onerror = () => {
            i++;
            if (i < urls.length) {
                attempt();
            }
        };
        document.head.appendChild(s);
    }
    attempt();
})([
    'https://verify.msg91.com/otp-provider.js',
    'https://verify.phone91.com/otp-provider.js'
]);
</script>
```

## Testing

To test MSG91 verification:

1. **Get an access token from MSG91 widget** (web)
2. **Test standalone verification**:
   ```bash
   curl -X POST https://your-backend.com/api/auth/msg91/verify-token \
     -H "Content-Type: application/json" \
     -d '{"accessToken": "your_token_here"}'
   ```

3. **Test OTP verification with MSG91 token**:
   ```bash
   curl -X POST https://your-backend.com/api/auth/otp/verify \
     -H "Content-Type: application/json" \
     -d '{
       "mobileno": "+919876543210",
       "otp": "123456",
       "isemailid": false,
       "msg91AccessToken": "your_token_here"
     }'
   ```

## Notes

- The MSG91 verification is optional - the standard OTP flow still works without it
- MSG91 token verification happens before standard OTP verification
- If MSG91 verification fails, the OTP verification fails immediately
- The auth key is currently hardcoded - consider moving to environment variables for production
- Uses Node.js built-in `https` module (no additional dependencies required)

## Environment Variables (Future Enhancement)

Consider moving MSG91 configuration to environment variables:

```env
MSG91_AUTH_KEY=489428AGbdetF92za69723550P1
MSG91_WIDGET_ID=366174697953393937363533
MSG91_BASE_URL=https://control.msg91.com
```

Then update `src/services/msg91.service.js` to use:
```javascript
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY || '489428AGbdetF92za69723550P1';
```

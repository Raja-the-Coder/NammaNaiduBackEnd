# API Test Guide: /api/auth/otp/send

## Full URL
```
POST https://nammanaidubackend.onrender.com/api/auth/otp/send
```

For local testing:
```
POST http://localhost:5000/api/auth/otp/send
```

## Headers
```
Content-Type: application/json
```

## Test Case 1: Send OTP via Mobile Number

### Request Payload
```json
{
  "mobileno": "+918098510184",
  "isemailid": false
}
```

### cURL Command
```bash
curl -X POST https://nammanaidubackend.onrender.com/api/auth/otp/send \
  -H "Content-Type: application/json" \
  -d '{
    "mobileno": "+918098510184",
    "isemailid": false
  }'
```

### Expected Response (Success)
```json
{
  "status": true,
  "mobileno": "+918098510184",
  "otp": "321654"
}
```

### Expected Response (Error)
```json
{
  "status": false,
  "message": "Mobile number is required when isemailid is false"
}
```

---

## Test Case 2: Send OTP via Email

### Request Payload
```json
{
  "mailid": "aravindrajacoder@gmail.com",
  "isemailid": true
}
```

### cURL Command
```bash
curl -X POST https://nammanaidubackend.onrender.com/api/auth/otp/send \
  -H "Content-Type: application/json" \
  -d '{
    "mailid": "aravindrajacoder@gmail.com",
    "isemailid": true
  }'
```

### Expected Response (Success)
```json
{
  "status": true,
  "mailid": "aravindrajacoder@gmail.com",
  "otp": "987654"
}
```

### Expected Response (Error)
```json
{
  "status": false,
  "message": "Email is required when isemailid is true"
}
```

---

## Postman Collection JSON

```json
{
  "info": {
    "name": "OTP Send API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Send OTP - Mobile",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"mobileno\": \"+918098510184\",\n  \"isemailid\": false\n}"
        },
        "url": {
          "raw": "https://nammanaidubackend.onrender.com/api/auth/otp/send",
          "protocol": "https",
          "host": ["nammanaidubackend", "onrender", "com"],
          "path": ["api", "auth", "otp", "send"]
        }
      }
    },
    {
      "name": "Send OTP - Email",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"mailid\": \"aravindrajacoder@gmail.com\",\n  \"isemailid\": true\n}"
        },
        "url": {
          "raw": "https://nammanaidubackend.onrender.com/api/auth/otp/send",
          "protocol": "https",
          "host": ["nammanaidubackend", "onrender", "com"],
          "path": ["api", "auth", "otp", "send"]
        }
      }
    }
  ]
}
```

---

## Validation Rules

### Mobile Number
- Required when `isemailid: false`
- Format: Must match regex `/^\+?[1-9]\d{1,14}$/`
- Example: `+918098510184` or `918098510184`

### Email
- Required when `isemailid: true`
- Format: Valid email address
- Example: `aravindrajacoder@gmail.com`

### isemailid
- Required: `true` or `false` (boolean)
- Determines whether to use email or mobile

---

## Load Testing Examples

### Using Apache Bench (ab)
```bash
# Mobile OTP
ab -n 100 -c 10 -p mobile_payload.json -T application/json \
  https://nammanaidubackend.onrender.com/api/auth/otp/send

# Email OTP
ab -n 100 -c 10 -p email_payload.json -T application/json \
  https://nammanaidubackend.onrender.com/api/auth/otp/send
```

### Using JMeter
1. Create HTTP Request
2. Method: POST
3. Path: `/api/auth/otp/send`
4. Body Data: Use JSON payloads above
5. Header: `Content-Type: application/json`

### Using Thunder Client / REST Client
- Method: POST
- URL: `https://nammanaidubackend.onrender.com/api/auth/otp/send`
- Headers: `Content-Type: application/json`
- Body: Use JSON payloads above

---

## Notes
- OTP is returned in the response for testing purposes
- OTP expires in 10 minutes (configurable via `OTP_EXPIRY_MINUTES`)
- For email: OTP is sent via Nodemailer to the provided email address
- For mobile: OTP is stored in database (SMS sending can be added later)

# Profile Actions API Test Documentation

## API Endpoints Summary

### Base URL: `/api/users`

All endpoints require authentication (Bearer token in Authorization header)

---

## 1. Create Profile Action (Interest/Shortlist)

**Endpoint:** `POST /api/users/profile-actions`

**Request Body:**
```json
{
  "actionType": "interest" | "shortlist" | "reject" | "accept",
  "targetUserId": "uuid-string"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Profile interest created successfully",
  "data": {
    "id": 1,
    "actionType": "interest",
    "userId": "user-uuid",
    "targetUserId": "target-uuid",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Error message here"
}
```

**Validation:**
- `actionType` must be one of: `interest`, `shortlist`, `reject`, `accept`
- `targetUserId` must be a valid UUID
- Cannot perform action on own profile
- Target user must exist

---

## 2. Remove Profile Action

**Endpoint:** `DELETE /api/users/profile-actions`

**Request Body:**
```json
{
  "actionType": "interest" | "shortlist" | "reject" | "accept",
  "targetUserId": "uuid-string"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Profile interest removed successfully"
}
```

---

## 3. Get Profile Actions for Target User

**Endpoint:** `GET /api/users/profile-actions/:targetUserId`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "actionType": "interest",
      "userId": "user-uuid",
      "targetUserId": "target-uuid",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "targetUser": {
        "id": 1,
        "accountId": "target-uuid",
        "name": "User Name",
        "userCode": "USR001"
      }
    }
  ]
}
```

---

## 4. Get My Profile Actions (Actions I Performed)

**Endpoint:** `GET /api/users/my-profile-actions`

**Query Parameters (Optional):**
- `actionType`: Filter by action type (`interest`, `shortlist`, `reject`, `accept`)

**Response:**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "id": 1,
      "actionType": "interest",
      "userId": "my-uuid",
      "targetUserId": "target-uuid",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "targetUser": {
        "id": 1,
        "accountId": "target-uuid",
        "name": "User Name",
        "userCode": "USR001",
        "gender": "Male",
        "dateOfBirth": "1990-01-01",
        "basicDetail": { ... },
        "personPhoto": { ... }
      }
    }
  ]
}
```

---

## 5. Get Received Profile Actions (Actions Received by Me)

**Endpoint:** `GET /api/users/received-profile-actions`

**Query Parameters (Optional):**
- `actionType`: Filter by action type (`interest`, `shortlist`, `reject`, `accept`)

**Response:**
```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "id": 1,
      "actionType": "interest",
      "userId": "sender-uuid",
      "targetUserId": "my-uuid",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "user": {
        "id": 1,
        "accountId": "sender-uuid",
        "name": "Sender Name",
        "userCode": "USR002",
        "gender": "Female",
        "dateOfBirth": "1992-01-01",
        "basicDetail": { ... },
        "personPhoto": { ... }
      }
    }
  ]
}
```

---

## Testing Checklist

### ✅ Backend Implementation Status

1. **Routes Registered:** ✅
   - Routes are properly registered in `user.routes.js`
   - Base path: `/api/users`
   - All routes require authentication

2. **Controller Functions:** ✅
   - `createProfileAction` - Creates/updates profile action
   - `removeProfileAction` - Removes profile action
   - `getProfileAction` - Gets actions for specific target user
   - `getMyProfileActions` - Gets actions performed by current user
   - `getReceivedProfileActions` - Gets actions received by current user

3. **Model:** ✅
   - `ProfileAction` model exists
   - Proper associations with User model
   - Unique constraint on (userId, targetUserId, actionType)
   - Proper indexes for performance

4. **Validation:** ✅
   - Action type validation (must be: interest, shortlist, reject, accept)
   - UUID validation for targetUserId
   - Self-action prevention
   - Target user existence check

5. **Notifications:** ✅
   - Push notifications sent when interest/shortlist is created
   - Notification records created in database

6. **Error Handling:** ✅
   - Proper try-catch blocks
   - Error logging
   - Appropriate HTTP status codes

---

## Potential Issues to Check

1. **Database Connection:** Ensure database is connected and `profile_actions` table exists
2. **Authentication Middleware:** Verify `authenticate` middleware is working correctly
3. **UUID Format:** Ensure `accountId` values are valid UUIDs
4. **Model Associations:** Verify User model associations are properly set up
5. **Notification Service:** Check if push notification service is configured correctly

---

## Quick Test Commands (using curl or Postman)

### Test Create Interest:
```bash
curl -X POST http://localhost:5000/api/users/profile-actions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "actionType": "interest",
    "targetUserId": "target-user-uuid"
  }'
```

### Test Create Shortlist:
```bash
curl -X POST http://localhost:5000/api/users/profile-actions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "actionType": "shortlist",
    "targetUserId": "target-user-uuid"
  }'
```

### Test Get Profile Actions:
```bash
curl -X GET http://localhost:5000/api/users/profile-actions/target-user-uuid \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Remove Action:
```bash
curl -X DELETE http://localhost:5000/api/users/profile-actions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "actionType": "shortlist",
    "targetUserId": "target-user-uuid"
  }'
```

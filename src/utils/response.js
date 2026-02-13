const sendResponse = (res, statusCode, success, message, data = null) => {
  const response = {
    success,
    message,
  };

  if (data) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

const successResponse = (res, data, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    data: data,
  });
};

const errorResponse = (res, message, statusCode = 400, code = null) => {
  const body = {
    success: false,
    message: message,
  };
  if (code) body.code = code;
  return res.status(statusCode).json(body);
};

module.exports = { sendResponse, successResponse, errorResponse };



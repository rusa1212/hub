export function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.status === 429) {
    return res.status(429).json({
      message: 'API 사용 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
    });
  }

  res.status(500).json({
    message: '요청을 처리하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  });
}

export function errorHandler(err, req, res, next) {
  console.error(err);
  res.status(500).json({
    message: '요청을 처리하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  });
}

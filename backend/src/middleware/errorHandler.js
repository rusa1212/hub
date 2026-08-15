// 모든 라우트의 next(err)를 받아 공통 에러 응답 형식({ message })으로 변환하는 전역 에러 핸들러
export function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.status === 429) {
    return res.status(429).json({
      message: 'API 사용 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
    });
  }

  if (err.status === 503) {
    return res.status(503).json({
      message: 'AI 서비스가 일시적으로 요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.',
    });
  }

  res.status(500).json({
    message: '요청을 처리하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  });
}

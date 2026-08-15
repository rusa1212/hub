const TIMEOUT_PATTERN = /시간 초과|timeout/i;

export function classifyRequestError(error) {
  const status = error?.status;
  const originalMessage = error?.message ?? '';

  if (status === 429) {
    return {
      code: 'rate_limit',
      title: '요청이 잠시 제한됐어요',
      message: '사용량이 많거나 API 사용 한도에 도달했어요. 잠시 후 다시 시도해주세요.',
      retryable: true,
    };
  }

  if (status === 503) {
    return {
      code: 'unavailable',
      title: 'AI가 잠시 바빠요',
      message: '서비스가 일시적으로 요청을 처리하지 못하고 있어요. 잠시 후 다시 시도해주세요.',
      retryable: true,
    };
  }

  if (status === 401 || status === 403) {
    return {
      code: 'auth',
      title: '인증을 확인해주세요',
      message: '로그인 정보가 만료됐거나 이 요청을 처리할 권한이 없어요.',
      retryable: false,
    };
  }

  if (status === 404) {
    return {
      code: 'not_found',
      title: '대화를 찾을 수 없어요',
      message: '세션이 만료됐거나 삭제되었을 수 있어요. 홈에서 새 대화를 시작해주세요.',
      retryable: false,
    };
  }

  if (status === 408 || status === 504 || TIMEOUT_PATTERN.test(originalMessage)) {
    return {
      code: 'timeout',
      title: '응답 시간이 길어지고 있어요',
      message: '제한 시간 안에 응답을 받지 못했어요. 네트워크 상태를 확인한 뒤 다시 시도해주세요.',
      retryable: true,
    };
  }

  if (!status && (error instanceof TypeError || /failed to fetch|network/i.test(originalMessage))) {
    return {
      code: 'network',
      title: '인터넷 연결을 확인해주세요',
      message: '서버에 연결하지 못했어요. 연결 상태를 확인한 뒤 다시 시도해주세요.',
      retryable: true,
    };
  }

  if (status >= 500) {
    return {
      code: 'server',
      title: '서버에서 문제가 발생했어요',
      message: '요청을 처리하는 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.',
      retryable: true,
    };
  }

  return {
    code: 'unknown',
    title: '응답을 받아오지 못했어요',
    message: '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.',
    retryable: true,
  };
}

-- 이메일 인증 방식을 없애고 아이디/비밀번호만으로 가입하도록 변경하면서:
-- 1) profiles의 nickname 컬럼을 username으로 정리 (값은 그대로 유지, 이름만 변경)
-- 2) 가입 시 함께 전달되는 아이디(raw_user_meta_data.username)를 profiles.username에 자동 저장
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요. (007 이후 순서로 실행)

alter table profiles rename column nickname to username;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, username)
  values (new.id, new.email, new.raw_user_meta_data->>'username');
  return new;
end;
$$;

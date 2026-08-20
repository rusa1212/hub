-- 회원가입한 사용자 정보를 저장하는 프로필 테이블
-- auth.users는 이메일/비밀번호 등 인증 정보만 가지고 있어 앱에서 직접 조회/조인하기
-- 불편하므로, 가입 시점에 auth.users를 미러링하는 public.profiles 행을 자동 생성한다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nickname text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "select_own_profile" on profiles;
create policy "select_own_profile" on profiles
  for select
  using (auth.uid() = id);

drop policy if exists "update_own_profile" on profiles;
create policy "update_own_profile" on profiles
  for update
  using (auth.uid() = id);

-- auth.users에 새 사용자가 생성될 때 profiles 행을 자동으로 만들어준다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

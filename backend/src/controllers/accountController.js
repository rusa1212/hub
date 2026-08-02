// 계정(Supabase Auth 사용자) 삭제 컨트롤러
import { getSupabase } from '../services/db.js';

export async function deleteAccount(req, res, next) {
  try {
    const { error } = await getSupabase().auth.admin.deleteUser(req.user.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

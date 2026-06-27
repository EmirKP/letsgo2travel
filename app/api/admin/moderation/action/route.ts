import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(request: Request) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "DB error" }, { status: 500 });

    const authHeader = request.headers.get("Authorization");
    let adminUserId = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) adminUserId = user.id;
    }

    const { reportId, targetType, targetId, action, reason } = await request.json();
    if (!targetType || !targetId || !action) {
      return NextResponse.json({ error: "Eksik alanlar" }, { status: 400 });
    }

    // Determine target table and status column update
    let targetTable = '';
    if (targetType === 'question') targetTable = 'country_questions';
    else if (targetType === 'answer') targetTable = 'country_answers';
    else if (targetType === 'comment') targetTable = 'country_experience_comments';
    else if (targetType === 'warning') targetTable = 'country_warnings';

    if (action !== 'close' && targetTable) {
      let newStatus = 'visible';
      if (action === 'hide') newStatus = 'hidden';
      if (action === 'remove') newStatus = 'removed';

      await supabase.from(targetTable).update({ status: newStatus }).eq('id', targetId);
    }

    if (reportId) {
      await supabase.from('content_reports').update({ status: 'closed' }).eq('id', reportId);
    }

    await supabase.from('content_moderation_actions').insert({
      admin_user_id: adminUserId,
      target_type: targetType,
      target_id: targetId,
      action,
      reason
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

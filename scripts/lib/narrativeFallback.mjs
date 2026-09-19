/**
 * Deterministic narrative used when the LLM is unavailable, times out, or the
 * batch has not reached this person yet.
 *
 * The UI must never show a profile with no prose in it, so every profile gets
 * one of these immediately and the LLM version overwrites it later. Marked
 * `narrative_status: "template"` so the interface can be honest about which is
 * which.
 */

export function templateFallback(profile) {
  const f = profile.facts;
  const i = profile.identity;
  const parts = [];

  parts.push(
    `${i.full_name} is a ${i.degree} ${i.branch} student at ${i.college}` +
      (i.grad_year ? `, graduating in ${i.grad_year}` : '') +
      (i.role_pref ? `, who signed up as a ${i.role_pref} builder.` : '.')
  );

  if (f.hackathons_attended > 0) {
    parts.push(
      `They have attended ${f.hackathons_attended} of the ${f.hackathons_registered} hackathons they registered for` +
        (f.projects_submitted
          ? ` and submitted ${f.projects_submitted} project${f.projects_submitted === 1 ? '' : 's'}` +
            (f.submission_rate !== null ? ` (a ${Math.round(f.submission_rate * 100)}% submission rate)` : '')
          : ', but have not submitted a project') +
        '.'
    );
  } else if (f.hackathons_registered > 0) {
    parts.push(`They have registered for ${f.hackathons_registered} hackathons but have not attended any of them.`);
  } else {
    parts.push('They have created an account but have not registered for an event yet.');
  }

  if (f.prize_count > 0) {
    const best = f.prizes.find((p) => p.rank === f.best_rank) || f.prizes[0];
    parts.push(
      `They have won ${f.prize_count} prize${f.prize_count === 1 ? '' : 's'}, including ` +
        `${best.rank ? `rank ${best.rank}` : best.prize_track} at ${best.hackathon} with "${best.project_title}"` +
        (best.score ? ` (scored ${best.score})` : '') +
        '.'
    );
  }

  const strong = profile.skills.filter((s) => s.confidence >= 0.5).slice(0, 3);
  if (strong.length) {
    parts.push(`Their strongest evidenced skills are ${strong.map((s) => s.skill).join(', ')}, based on ${strong[0].sources.map((x) => x.detail)[0]}.`);
  }

  const gaps = profile.skills.filter((s) => s.claim_gap).slice(0, 3);
  if (gaps.length) {
    parts.push(`They declare ${gaps.map((s) => s.skill).join(', ')} with no supporting repository or project evidence on the platform.`);
  }

  if (f.avg_mentor_score) {
    parts.push(`Mentors rated them ${f.avg_mentor_score} out of 5 across ${f.mentor_sessions} session${f.mentor_sessions === 1 ? '' : 's'}.`);
  }

  const traj = profile.trajectory;
  if (traj.direction === 'rising') parts.push(`Their judged scores are improving over time (${traj.score_series.map((s) => s.score).join(' → ')}).`);
  else if (traj.direction === 'declining') parts.push(`Their judged scores have declined over time (${traj.score_series.map((s) => s.score).join(' → ')}).`);

  const statusLine = {
    active: `Last active ${f.last_active} — currently active.`,
    cooling: `Last active ${f.last_active}, ${f.days_since_active} days ago — cooling off.`,
    dormant: `Last active ${f.last_active}, ${f.days_since_active} days ago — dormant and worth re-engaging.`,
    lapsed: `Last active ${f.last_active}, ${f.days_since_active} days ago — lapsed.`,
    unknown: 'No recorded activity.',
  }[traj.status];
  parts.push(statusLine);

  if (!i.consent_flag) parts.push('They have not consented to outreach, so they must be excluded from campaigns.');

  return parts.join(' ');
}

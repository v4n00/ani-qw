export function availability(media, now = Date.now() / 1000) {
  if (media.status === 'NOT_YET_RELEASED') return 0;
  if (media.status === 'FINISHED' && media.episodes > 0) return media.episodes;
  if (media.nextAiringEpisode?.episode > 0) return Math.max(0, media.nextAiringEpisode.episode - 1);
  const aired = media.airingSchedule?.nodes?.filter(n => n.airingAt <= now).map(n => n.episode) || [];
  if (aired.length) return Math.max(...aired);
  return null;
}

export function nextEpisode(media) {
  const progress = Math.max(0, media.mediaListEntry?.progress || 0);
  const available = availability(media);
  if (available === 0) return null;
  if (media.mediaListEntry?.status === 'COMPLETED') return 1;
  if (media.format === 'MOVIE') return 1;
  if (media.status === 'FINISHED' && media.episodes > 0 && progress >= media.episodes) return 1;
  if (available !== null && progress >= available) return Math.max(1, available);
  return progress + 1;
}

export function progressUpdate(media, episode, completion = {}) {
  const entry = media.mediaListEntry;
  if (completion.rewatch) {
    if ((entry?.repeat || 0) > (completion.repeatBase || 0)) return null;
    if (entry?.status === 'COMPLETED') {
      const final = media.episodes > 0 && episode >= media.episodes;
      return {mediaId:media.id,progress:episode,status:final?'COMPLETED':'REPEATING',...(final?{repeat:Math.min(1000,(entry.repeat||0)+1)}:{})};
    }
  }
  if ((entry?.progress || 0) >= episode) return null;
  const progress = Math.max(entry?.progress || 0, episode);
  const status = entry?.status === 'COMPLETED' || (media.episodes > 0 && progress >= media.episodes)
    ? 'COMPLETED' : entry?.status === 'REPEATING' ? 'REPEATING' : 'CURRENT';
  return { mediaId: media.id, progress, status, ...(entry?.status === 'REPEATING' && status === 'COMPLETED' ? {repeat: Math.min(1000, (entry.repeat || 0) + 1)} : {}) };
}

export function helperMedia(m) {
  return { id: m.id, title: m.title.romaji || m.title.english || m.title.native,
    titles: [...new Set([...Object.values(m.title), ...(m.synonyms || [])].filter(Boolean))].slice(0, 50),
    format: m.format, status: m.status, episodes: m.episodes || 0 };
}

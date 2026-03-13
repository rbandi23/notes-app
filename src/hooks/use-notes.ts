import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useNotes(page = 1, limit = 20) {
  const { data, error, isLoading, mutate } = useSWR(
    `/api/notes?page=${page}&limit=${limit}`,
    fetcher
  );
  return {
    notes: data?.notes || [],
    pagination: data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 },
    isLoading,
    isError: !!error,
    mutate,
  };
}

export function useSearchNotes(query: string, page = 1, limit = 20) {
  const { data, error, isLoading } = useSWR(
    query?.trim()
      ? `/api/notes/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`
      : null,
    fetcher
  );
  return {
    notes: data?.notes || [],
    pagination: data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 },
    isLoading,
    isError: !!error,
  };
}

export function useNote(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/notes/${id}` : null,
    fetcher
  );
  return {
    note: data?.note,
    relatedNotes: data?.relatedNotes || [],
    webContent: data?.webContent || [],
    isLoading,
    isError: !!error,
    mutate,
  };
}

export function useRelatedContent(id: string, shouldPoll: boolean) {
  const { data, error, isLoading } = useSWR(
    id ? `/api/notes/${id}/related` : null,
    fetcher,
    { refreshInterval: shouldPoll ? 2000 : 0 }
  );
  return {
    enrichmentStatus: data?.enrichmentStatus,
    relatedNotes: data?.relatedNotes || [],
    webContent: data?.webContent || [],
    isLoading,
    isError: !!error,
  };
}

export async function createNote(data: {
  title: string;
  content: string;
  contentJson?: unknown;
}) {
  const res = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create note");
  return res.json();
}

export async function updateNote(
  id: string,
  data: { title?: string; content?: string; contentJson?: unknown }
) {
  const res = await fetch(`/api/notes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update note");
  return res.json();
}

export async function deleteNote(id: string) {
  const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete note");
  return res.json();
}

export async function shareNote(id: string) {
  const res = await fetch(`/api/notes/${id}/share`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to share note");
  return res.json();
}

export async function unshareNote(id: string) {
  const res = await fetch(`/api/notes/${id}/share`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to unshare note");
  return res.json();
}

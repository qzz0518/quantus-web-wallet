export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function download(
  text: string,
  name: string,
  mime = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

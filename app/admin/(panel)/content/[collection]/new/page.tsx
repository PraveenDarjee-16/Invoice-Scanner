import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentForm } from "@/components/admin/ContentForm";
import { getCollection } from "@/lib/cms";

export const metadata: Metadata = { title: "Add content" };

export default async function NewContentPage({ params }: { params: Promise<{ collection: string }> }) {
  const def = getCollection((await params).collection);
  if (!def) notFound();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Add {def.singular.toLowerCase()}</h1>
      <ContentForm def={def} />
    </div>
  );
}

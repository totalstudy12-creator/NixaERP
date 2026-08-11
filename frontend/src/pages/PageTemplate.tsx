import { ReactNode } from 'react';

interface PageTemplateProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export function PageTemplate({ title, description, children }: PageTemplateProps) {
  return (
    <div className="space-y-8">
      <section className="page-header">
        <div className="flex flex-col gap-6 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">Module</p>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">{title}</h1>
            {description && <p className="page-description">{description}</p>}
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary">View API guide</button>
            <button className="btn btn-secondary">Build workflow</button>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-slate-50 p-8 shadow-sm">
        {children ? (
          <div className="text-slate-700 text-sm leading-7 space-y-4">{children}</div>
        ) : (
          <div className="text-slate-700 text-sm leading-7 space-y-4">
            <p>
              This page is a module placeholder for the {title} workflow. Use it as a starting point for building the full feature,
              connecting UI flows to API endpoints, and adding forms, tables, charts, or integrations.
            </p>
            <p className="text-slate-500">Check the API docs for supported endpoints and mobile integration patterns.</p>
          </div>
        )}
      </section>
    </div>
  );
}

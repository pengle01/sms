"use client";

// A GET-form select that applies itself immediately on change — no Filter
// button needed. Options are passed as children from the server component.
export function FilterSelect({
  name,
  defaultValue,
  className,
  children,
}: {
  name: string;
  defaultValue: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className={className}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      {children}
    </select>
  );
}

export function FormSelect(props: any) {
  const { label, children, ...rest } = props;
  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <select className="input-field w-full" {...rest}>
        {children}
      </select>
    </div>
  );
}

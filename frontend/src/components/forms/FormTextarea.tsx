export function FormTextarea(props: any) {
  const { label, ...rest } = props;
  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <textarea className="input-field w-full" {...rest} />
    </div>
  );
}

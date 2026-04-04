"use client";

type AutoSubmitSelectProps = {
  name: string;
  defaultValue: string;
  options: Array<{
    label: string;
    value: string;
  }>;
};

export function AutoSubmitSelect({ name, defaultValue, options }: AutoSubmitSelectProps) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      onChange={(event) => {
        event.currentTarget.form?.requestSubmit();
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

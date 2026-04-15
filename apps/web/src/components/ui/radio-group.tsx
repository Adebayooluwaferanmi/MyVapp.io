import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

import { cn } from "@/lib/utils";

export const RadioGroup = RadioGroupPrimitive.Root;

export function RadioGroupItem({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        "size-4 rounded-full border border-[color:var(--border)] bg-white text-[color:var(--primary)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] focus:ring-offset-2",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <div className="size-2 rounded-full bg-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

import { HTMLAttributes } from 'react';
export default function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={['app-card', className || ''].join(' ')}
      {...rest}
    />
  );
}

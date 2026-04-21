import { HTMLAttributes } from 'react';

export default function Skeleton(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={["skeleton", props.className || ''].join(' ')} />;
}


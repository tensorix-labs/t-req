import type { JSX } from 'solid-js';

type IconProps = {
  class?: string;
};

function Svg(props: JSX.SvgSVGAttributes<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg class={props.class}>
      <path d="M6 3.75L10.5 8 6 12.25" />
    </Svg>
  );
}

export function FolderClosedIcon(props: IconProps) {
  return (
    <Svg class={props.class}>
      <path d="M1.75 4.5h4.4l1.1 1.25h6.95v6.3a1.2 1.2 0 0 1-1.2 1.2H2.95a1.2 1.2 0 0 1-1.2-1.2V5.7a1.2 1.2 0 0 1 1.2-1.2z" />
    </Svg>
  );
}

export function FolderOpenIcon(props: IconProps) {
  return (
    <Svg class={props.class}>
      <path d="M1.75 4.5h4.4l1.1 1.25h6.95v1.15H1.75V5.7a1.2 1.2 0 0 1 1.2-1.2z" />
      <path d="M1.95 7.4h12.1l-1.05 4.65a1.2 1.2 0 0 1-1.17.95H3.17a1.2 1.2 0 0 1-1.17-.95L1.95 7.4z" />
    </Svg>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <Svg class={props.class}>
      <path d="M4 1.75h5l3 3v8.5A1.25 1.25 0 0 1 10.75 14.5h-6.5A1.25 1.25 0 0 1 3 13.25v-10A1.5 1.5 0 0 1 4.5 1.75z" />
      <path d="M9 1.75V5h3" />
    </Svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Svg class={props.class}>
      <path d="M13.25 8a5.25 5.25 0 1 1-1.45-3.63" />
      <path d="M13.25 2.75v3.3h-3.3" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg class={props.class}>
      <path d="M8 3v10" />
      <path d="M3 8h10" />
    </Svg>
  );
}

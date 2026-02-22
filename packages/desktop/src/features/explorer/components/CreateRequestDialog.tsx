import { setupDialogFocusTrap } from '@t-req/ui';
import { createEffect, createMemo, For, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import {
  CREATE_WORKSPACE_ITEM_OPTIONS,
  type CreateWorkspaceItemKind,
  isCreateRequestKind
} from '../create-request';

type CreateRequestDialogProps = {
  open: boolean;
  isBusy: boolean;
  name: string;
  kind: CreateWorkspaceItemKind;
  targetLabel: string;
  error: string | undefined;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onKindChange: (kind: CreateWorkspaceItemKind) => void;
  onSubmit: () => void;
};

export function CreateRequestDialog(props: CreateRequestDialogProps) {
  let dialogRef: HTMLDivElement | undefined;

  const selectedDescription = createMemo(() => {
    const option =
      CREATE_WORKSPACE_ITEM_OPTIONS.find((item) => item.kind === props.kind) ??
      CREATE_WORKSPACE_ITEM_OPTIONS[0];
    if (!option) {
      return '';
    }
    return option.disabled ? `${option.description} (coming soon)` : option.description;
  });

  const isCreateDisabled = createMemo(() => {
    if (!isCreateRequestKind(props.kind)) {
      return true;
    }
    if (props.isBusy) {
      return true;
    }
    return props.name.trim().length === 0;
  });

  createEffect(() => {
    if (!props.open || !dialogRef) {
      return;
    }

    const cleanupFocusTrap = setupDialogFocusTrap(dialogRef, {
      onRequestClose: props.onClose
    });

    onCleanup(() => {
      cleanupFocusTrap();
    });
  });

  const handleSubmit = (event: Event) => {
    event.preventDefault();
    props.onSubmit();
  };

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="modal modal-open"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-item-title"
        >
          <div
            ref={dialogRef}
            class="modal-box border border-base-300 bg-base-100/95 text-base-content shadow-2xl"
            tabIndex={-1}
          >
            <h3
              id="new-item-title"
              class="font-mono text-[1.12rem] font-semibold tracking-[-0.01em] text-base-content"
            >
              New Request
            </h3>
            <p class="mt-1 font-mono text-[12px] text-base-content/65">
              Choose a type, then provide a filename.
            </p>

            <form class="mt-4 space-y-4" onSubmit={handleSubmit}>
              <fieldset class="space-y-2">
                <legend class="font-mono text-[12px] text-base-content/70">Type</legend>
                <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <For each={CREATE_WORKSPACE_ITEM_OPTIONS}>
                    {(option) => (
                      <label
                        class="label cursor-pointer items-start justify-start gap-2 rounded-box border border-base-300 bg-base-200/40 p-3 font-mono"
                        classList={{
                          'border-primary bg-primary/10': props.kind === option.kind,
                          'cursor-not-allowed opacity-60': option.disabled,
                          'hover:border-primary/40': !option.disabled
                        }}
                      >
                        <input
                          type="radio"
                          class="radio radio-sm mt-0.5"
                          name="request-type"
                          value={option.kind}
                          checked={props.kind === option.kind}
                          disabled={option.disabled || props.isBusy}
                          onChange={(event) =>
                            props.onKindChange(event.currentTarget.value as CreateWorkspaceItemKind)
                          }
                        />
                        <span class="label-text flex min-w-0 items-start justify-between gap-2 text-left">
                          <span class="min-w-0">
                            <span class="block text-sm font-semibold tracking-[0.01em] text-base-content">
                              {option.label}
                            </span>
                            <span class="block text-[12px] text-base-content/65">
                              {option.description}
                            </span>
                          </span>
                          <Show when={option.disabled}>
                            <span class="badge badge-outline badge-xs shrink-0">Soon</span>
                          </Show>
                        </span>
                      </label>
                    )}
                  </For>
                </div>
              </fieldset>

              <label class="form-control gap-1">
                <span class="label-text font-mono text-[12px] text-base-content/70">Filename</span>
                <input
                  type="text"
                  class="input input-sm w-full border-base-300 bg-base-100/70 font-mono text-sm"
                  value={props.name}
                  onInput={(event) => props.onNameChange(event.currentTarget.value)}
                  placeholder="new-request"
                  aria-label="New request file name"
                  disabled={props.isBusy}
                />
              </label>

              <div class="rounded-box border border-base-300 bg-base-200/40 px-3 py-2">
                <p class="font-mono text-[12px] text-base-content/70">
                  Create in: {props.targetLabel}
                </p>
                <p class="mt-1 text-sm text-base-content/65">{selectedDescription()}</p>
              </div>

              <Show when={props.error}>
                {(message) => <p class="text-sm text-error">{message()}</p>}
              </Show>

              <div class="modal-action mt-0">
                <button
                  type="button"
                  class="btn btn-ghost btn-sm font-mono text-[12px] normal-case"
                  onClick={props.onClose}
                  disabled={props.isBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn btn-primary btn-sm rounded-full border border-primary/70 px-5 font-mono text-[13px] font-semibold tracking-[0.01em] normal-case shadow-sm hover:brightness-110"
                  disabled={isCreateDisabled()}
                >
                  Create
                </button>
              </div>
            </form>
          </div>
          <button
            type="button"
            class="modal-backdrop"
            onClick={props.onClose}
            aria-label="Close new request dialog"
          >
            close
          </button>
        </div>
      </Portal>
    </Show>
  );
}

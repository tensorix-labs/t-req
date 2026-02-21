export function EmptyRequestWorkspace() {
  return (
    <div class="flex h-full items-center justify-center p-4">
      <div class="card w-full max-w-xl border border-base-300 bg-base-200/60 shadow-sm">
        <div class="card-body gap-3 text-center">
          <h3 class="card-title mx-auto text-base-content">Select a request file</h3>
          <p class="text-sm text-base-content/75">
            Choose a `.http` file from the tree to load a single request workspace.
          </p>
        </div>
      </div>
    </div>
  );
}

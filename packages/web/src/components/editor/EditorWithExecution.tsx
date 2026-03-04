import { type Component, Match, Switch } from 'solid-js';
import { getFileType } from '../../utils/fileType';
import { HttpEditorWithExecution } from './HttpEditorWithExecution';
import { ScriptEditorWithExecution } from './ScriptEditorWithExecution';

interface EditorWithExecutionProps {
  path: string;
}

/**
 * EditorWithExecution is a lightweight router that mounts the appropriate
 * specialized editor based on file type.
 *
 */
export const EditorWithExecution: Component<EditorWithExecutionProps> = (props) => {
  const fileType = () => getFileType(props.path);

  return (
    <div class="flex flex-col h-full">
      <Switch>
        {/* HTTP files: request workspace + execution panel */}
        <Match when={fileType() === 'http'}>
          <HttpEditorWithExecution path={props.path} />
        </Match>

        {/* Script and test files: code editor with script panel */}
        <Match when={fileType() === 'script' || fileType() === 'test'}>
          <ScriptEditorWithExecution path={props.path} fileType={fileType()} />
        </Match>
      </Switch>
    </div>
  );
};

export default EditorWithExecution;

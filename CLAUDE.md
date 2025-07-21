このプロジェクトはgemini APIを使った文字起こしアプリケーションです。
- gemini api docs: https://ai.google.dev/gemini-api/docs/audio

要件:
- アプリケーションは英語で作成する。
- electronによるUI。複数タブを持つ。
  - sttはまずはgemini apiで設計するが、のちのproviderの変更を考慮に入れる。i.e. openai gpt-4o-transcribe, local whisper
  - real time stt mode
    - startボタンを押すとデスクトップ音声を取得→録音し、一定時間のチャンクごとにgemini stt apiを使って文字起こしする。文字起こしされた文字はUI上に表示する。
    - .env からapi_key, model, チャンクの時間、output_dirを読み込む。これはUI上の設定画面からも変更可能。default modelはgemini-2.5-flash
    - 出力言語を変更する機能を実装する。defaultはauto、つまり入力言語と同じ。出力の選択肢はEnglishとJapaneseだけで良い。
    - startボタンは実行中はstopボタンとなり、stopすると文字起こしした全てのテキストを一つのvttファイルとして保存する。
  - file stt mode
    - 音声を含むファイルを選択し、startを押すとsttを行う。
    - 出力言語を変更する機能を実装する。defaultはauto、つまり入力言語と同じ。出力の選択肢はEnglishとJapaneseだけで良い。
    - このモードでは文字起こししたテキストを画面に表示しない。ファイルに出力し、処理完了を表示する。
  - speach to text mode
    - real time sttとほぼ同じだが、音声ソースをローカルマシンのマイク入力する。ソースを選択できるUIを追加する。
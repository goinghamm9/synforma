# TRIBE bridge (research)

Turns a screen recording of a Synforma run into a **stimulus analysis**: the predicted response of an
*average subject's* cortex to the screens in the recording, from Meta FAIR's TRIBE v2 encoding model,
aggregated into six readable series that Synforma can import (Science → Predicted cortical response).

## What this is, and what it is not

- **It is** a property of the stimulus. TRIBE v2 predicts fMRI responses of an average subject to video,
  audio and text. Given a recording of the screens a person saw, it predicts which cortical systems a
  typical viewer's brain would engage while those screens are on display. Like a readability score, it
  describes the material, not the reader.
- **It is not** a measurement of anyone. It does not read, track or infer a user's brain, attention,
  emotion or state. Synforma records no biometrics and infers no traits. Every document this tool writes
  carries the sentence below, and Synforma shows it wherever the data appears:

  > Predicted response of an average subject's cortex to the recorded screen content (TRIBE v2 encoding
  > model). A property of the screens, not a measurement of any person. Research use; the model is
  > licensed CC BY-NC 4.0.

- **Licence.** TRIBE v2 is released under CC BY-NC 4.0: non-commercial use only. Using it inside a
  commercial product or service needs a separate licence from Meta. This bridge is for research and
  design studies.

## Requirements

- Python 3.11 or newer; a CUDA GPU for practical run times (the model stacks V-JEPA 2 ViT-g, DINOv2,
  Llama 3.2 3B and Qwen3 backbones; CPU inference works but is very slow).
- A Hugging Face account logged in locally (`hf auth login`) with access to the gated backbones TRIBE v2
  downloads (`meta-llama/Llama-3.2-3B` needs its licence accepted on the Hub) and disk for the weights.
- `ffmpeg` on the PATH (moviepy uses it to read the recording).

```bash
cd services/tribe-bridge
python -m venv .venv && source .venv/bin/activate
pip install -e ".[model]"          # tribev2 from GitHub, mne (HCP-MMP1 parcellation), torch
pip install -e ".[server]"         # optional HTTP front
pip install -e ".[test]" && pytest # unit tests: no model needed
```

## Usage

1. In Synforma → Mission Control → Advanced → Act, press **Record screen**, run the workflow, stop. Two
   files download: `synforma-run-<id>.webm` and `synforma-run-<id>-steps.json` (step windows in seconds).
2. Analyse:

   ```bash
   python -m tribe_bridge.analyze --video synforma-run-<id>.webm --steps synforma-run-<id>-steps.json --out analysis.json
   ```

   First run downloads the weights (several GB). `--device cpu` forces CPU; `--cache` sets the model folder.
3. In Synforma → Science → Predicted cortical response, import `analysis.json`.

Optional server (keep it on a private network; it accepts uploads and holds the model in memory):

```bash
uvicorn tribe_bridge.server:app --host 127.0.0.1 --port 8765
curl -F video=@run.webm -F steps=@run-steps.json http://127.0.0.1:8765/analyze > analysis.json
```

## Output (version 1)

| Field | Meaning |
|---|---|
| `source.sampleS` | seconds per sample: TRIBE v2 predicts one sample per TR of its training data |
| `source.lagS` | 5: TRIBE shifts predictions 5 s into the past to undo the hemodynamic lag |
| `model` | `facebook/tribev2`, checkpoint, `subject: "average"`, licence |
| `systems[]` | `visual`, `language`, `attention`, `motor`, `default`, `other`: mean over the vertices of each system per sample, z-scored across the recording |
| `steps[]` | the step windows from the steps file, unchanged |
| `disclaimer` | the sentence above, verbatim |

**Systems** group the 22 HCP-MMP1 sections (Glasser et al. 2016, MNE's combined parcellation on
fsaverage5) by substring match, see `tribe_bridge/systems.py`: visual ← the five visual sections;
language ← early and association auditory, lateral temporal, temporo-parieto-occipital junction, inferior
frontal; attention ← superior and inferior parietal, dorsolateral prefrontal; motor ← somatosensory/motor,
paracentral, premotor; default ← medial temporal, posterior cingulate, anterior cingulate and medial
prefrontal, orbital and polar frontal; other ← opercular and insular. The medial wall is dropped. This is
a readability grouping, not a functional claim; pass a different mapping to `build_systems` to change it.

## Limitations

- A silent screen recording feeds only TRIBE's video pathway. On-screen text is not read as language
  input (TRIBE's text stream comes from transcribed speech), so the language series reflects what the
  vision model makes of the screen, not the words on it.
- Predictions are for an average subject on a group template; individual brains differ, and the model was
  trained on naturalistic movies, not on software interfaces. Treat the series as a coarse prior for
  comparing screens, never as ground truth.
- The bridge has been exercised with unit tests on the aggregation and document assembly; the model run
  itself requires the GPU environment above.

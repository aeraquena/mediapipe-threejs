# Tensordancer

Two people dance together and train AIs on each others' movements.

https://github.com/user-attachments/assets/d58597eb-e464-4ba9-8c6c-43c65a01da88

## Setup

1. Install node: https://nodejs.org/en/download
2. Navigate to the project directory
3. `npm install`
4. `npx vite`

## Play

1. Click "Enable Webcam" to see body tracking
2. Optional: To see full video, click "Video On"

### 2 players

3. Position 2 bodies so that their whole bodies are visible in the video frame
4. Both players raise their right hand for 3 seconds to start the AI model training
5. Two players dance for 10 seconds
6. When the countdown finishes, wait for about 10 seconds for the models to finish training
7. Two AI bodies will appear alongside the human bodies. Player 1's movements control AI 2 (which acts as Player 2), while Player 2's movements control AI 1 (which acts as Player 1)

### 1 player

3. Position 1 body so that their whole body is visible in the video frame
4. 1 player raises their right hand for 3 seconds to start the AI training
5. 1 player dances for 10 seconds as Player 1
6. Count down 3 seconds
7. 1 player dances for 10 seconds as Player 2. They see a recording of Player 1 to time their movements to
8. When the countdown finishes, wait for about 10 seconds for the models to finish training
9. Two AI bodies will appear alongside the human body. Player 1's movements control both AIs - AI 1 is trained as the first movement recording, and AI 2 is trained as the second movement recording

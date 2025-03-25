const express = require("express");
const multer = require("multer");
const Resume = require("../models/Resume");
const User = require("../models/User");
const { analyzeResume } = require("../utils/resumeAnalyzer");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();
// Configure Multer to store files in memory (not in a folder)
const storage = multer.memoryStorage(); // Store file in RAM instead of disk
const upload = multer({ storage: storage });


router.post("/scraper", upload.single("image"), authMiddleware, async (req, res) => {
    console.log("Request received at /image/scraper"); // Debugging
  try {
    const { userId } = req.user; // Extract from token middleware
    console.log("userId",userId);
    const imageFile = req.file;

    if (!imageFile) return res.status(400).json({ error: "No image uploaded" });

    // Extract mimetype and file buffer
    const mimeType = imageFile.mimetype;  // Example: "application/pdf"
    const fileBuffer = imageFile.buffer;  // File data in memory
    console.log(mimeType, fileBuffer);
    // Analyze Image
    const result = await analyzeImage(fileBuffer, mimeType);

    console.log("Type of result:", typeof result);
    console.log("Full result:", result);

    console.log(result.analysis);
    // Save to DB
    const newResume = new Resume({
      userId,
      file: resumeFile.buffer, // Store PDF as binary data
      contentType: resumeFile.mimetype, // Store MIME type
      extractedText: result.extractedText,
      analysis: result.analysis,
      score: result.score,
      missingKeywords: result.missingKeywords,
      suggestedJobs: result.suggestedJobs,
      readabilityScore: result.readabilityScore,
      grammarIssues: result.grammarIssues,
      atsFriendly: result.atsFriendly,


  });
  await newResume.save(); // Save to Resume collection

  // Update user's resumes array with new Resume ObjectId
  const user = await User.findByIdAndUpdate(
      userId,
      { $push: { resumes: newResume._id } }, // Store ObjectId in user's resumes array
      { new: true }
  );

  console.log("for verification");
  console.log(result.sectionScores);

  res.json({ message: "Resume added successfully", resume: newResume, sectionScores: result.sectionScores });
  } catch (error) {
    res.status(500).json({ error: "Error analyzing resume" });
  }
});

// added
// Get statistics data
router.get('/stats', async (req, res) => {
  try {
    const totalResumes = await Resume.countDocuments();

    const scoreDistribution = await Resume.aggregate([
      {
        $group: {
          _id: { $ceil: { $divide: ["$score", 10] } }, // Group by score range (1-10, 11-20, etc.)
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const readabilityDistribution = await Resume.aggregate([
      {
        $group: {
          _id: {
            $cond: {
              if: { $lte: ["$readabilityScore", 40] },
              then: "Low",
              else: {
                $cond: {
                  if: { $lte: ["$readabilityScore", 70] },
                  then: "Medium",
                  else: "High"
                }
              }
            }
          },
          count: { $sum: 1 }
        }
      }
    ]);
    

    const atsFriendlyCount = await Resume.aggregate([
      {
        $group: {
          _id: "$atsFriendly",
          count: { $sum: 1 }
        }
      }
    ]);

    const topMissingKeywords = await Resume.aggregate([
      { $unwind: "$missingKeywords" },
      { $group: { _id: "$missingKeywords", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const topGrammarIssues = await Resume.aggregate([
      { $unwind: "$grammarIssues" },
      { $group: { _id: "$grammarIssues", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      totalResumes,
      scoreDistribution,
      readabilityDistribution,
      atsFriendlyCount,
      topMissingKeywords,
      topGrammarIssues
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



module.exports = router;
import type { ChapterOption, ConceptData } from "@/types";

export interface CurriculumChapter {
  ch: string;
  topics: string[];
}

export type CurriculumData = Record<number, Record<string, CurriculumChapter[]>>;

export const curriculumData = {
  "6": {
    "Mathematics": [
      {
        "ch": "Patterns in Mathematics",
        "topics": [
          "Patterns in Numbers",
          "Visualising Number Sequences",
          "Relations among Number Sequences",
          "Patterns in Shapes",
          "Counting Numbers, Odd and Even Numbers",
          "Triangular, Square, Cube Numbers",
          "Fibonacci Sequence"
        ]
      },
      {
        "ch": "Lines and Angles",
        "topics": [
          "Points, Line Segments, Rays and Lines",
          "Types of Angles (Acute, Obtuse, Right, Straight, Reflex)",
          "Measuring Angles using Protractor",
          "Complementary and Supplementary Angles",
          "Parallel and Intersecting Lines"
        ]
      },
      {
        "ch": "Number Play",
        "topics": [
          "Numbers as Labels, Positions and Quantities",
          "Number Puzzles and Creative Digit Arrangements",
          "Place Value",
          "Factors and Multiples",
          "Divisibility Rules",
          "HCF and LCM"
        ]
      },
      {
        "ch": "Data Handling and Presentation",
        "topics": [
          "Collecting Data",
          "Organising Data (Tally Marks, Frequency Tables)",
          "Pictographs",
          "Bar Graphs",
          "Interpreting Data"
        ]
      },
      {
        "ch": "Prime Time",
        "topics": [
          "Prime and Composite Numbers",
          "Sieve of Eratosthenes",
          "Divisibility Rules (2,3,4,5,6,8,9,10,11)",
          "HCF and LCM",
          "Goldbach's Conjecture"
        ]
      },
      {
        "ch": "Perimeter and Area",
        "topics": [
          "Perimeter of Rectangles, Squares, Triangles",
          "Area by Counting Unit Squares",
          "Area Formulae for Rectangles and Squares",
          "Real-life Applications"
        ]
      },
      {
        "ch": "Fractions",
        "topics": [
          "Fractions as Parts of Shapes and Groups",
          "Equivalent Fractions",
          "Comparing Fractions",
          "Proper, Improper and Mixed Fractions",
          "Addition and Subtraction of Fractions",
          "Fractions on Number Line"
        ]
      },
      {
        "ch": "Playing with Constructions",
        "topics": [
          "Using Compass and Ruler",
          "Drawing Circles and Arcs",
          "Constructing Perpendicular Bisectors",
          "Geometric Art Patterns"
        ]
      },
      {
        "ch": "Symmetry",
        "topics": [
          "Line Symmetry",
          "Identifying Lines of Symmetry in 2D Shapes",
          "Lines of Symmetry in Alphabets and Numerals",
          "Completing Symmetrical Figures",
          "Rotational Symmetry"
        ]
      },
      {
        "ch": "The Other Side of Zero",
        "topics": [
          "Introduction to Negative Numbers",
          "Integer Number Line",
          "Ordering and Comparing Integers",
          "Addition and Subtraction of Integers",
          "Absolute Value"
        ]
      }
    ],
    "Science": [
      {
        "ch": "The Wonderful World of Science",
        "topics": [
          "The Wonderful World of Science"
        ]
      },
      {
        "ch": "Diversity in the Living World",
        "topics": [
          "Diversity in Plants and Animals Around Us",
          "How to Group Plants and Animals?",
          "Plants and Animals in Different Surroundings"
        ]
      },
      {
        "ch": "Mindful Eating: A Path to a Healthy Body",
        "topics": [
          "What Do We Eat?",
          "What are the Components of Food?",
          "How to Test Different Components of Food?",
          "Balanced Diet",
          "Millets: Nutrition-rich Cereals",
          "Food Miles: From Farm to Our Plate"
        ]
      },
      {
        "ch": "Exploring Magnets",
        "topics": [
          "Magnetic and Non-magnetic Materials",
          "Poles of a Magnet",
          "Finding Directions",
          "Attraction and Repulsion between Magnets",
          "Fun with Magnets"
        ]
      },
      {
        "ch": "Measurement of Length and Motion",
        "topics": [
          "How do we Measure?",
          "Standard Units",
          "Correct Way of Measuring Length",
          "Measuring the Length of a Curved Line",
          "Describing Position",
          "Moving Things",
          "Types of Motion"
        ]
      },
      {
        "ch": "Materials Around Us",
        "topics": [
          "Materials Around Us"
        ]
      },
      {
        "ch": "Temperature and its Measurement",
        "topics": [
          "Hot or Cold?",
          "Temperature",
          "Measuring Temperature"
        ]
      },
      {
        "ch": "A Journey through States of Water",
        "topics": [
          "Investigating Water's Disappearing Act",
          "Another Mystery",
          "What are the Different States of Water?",
          "How can We Change the States of Water?",
          "How can Water be Evaporated Faster or Slower?",
          "Cooling Effect"
        ]
      },
      {
        "ch": "Methods of Separation in Everyday Life",
        "topics": [
          "Methods of Separation in Everyday Life"
        ]
      },
      {
        "ch": "Living Creatures: Exploring their Characteristics",
        "topics": [
          "What Sets the Living Apart from the Non-living?",
          "Essential Conditions for Germination of a Seed",
          "Growth and Movement in Plants",
          "Life Cycle of a Plant",
          "Life Cycle of Animals"
        ]
      },
      {
        "ch": "Nature's Treasures",
        "topics": [
          "Air",
          "Water",
          "Energy from the Sun",
          "Forests",
          "Soil, Rocks and Minerals",
          "Fossil Fuels",
          "Natural Resources: Renewable and Non-renewable"
        ]
      },
      {
        "ch": "Beyond Earth",
        "topics": [
          "Stars and Constellations",
          "Night Sky Watching",
          "Our Solar System",
          "The Milky Way Galaxy",
          "The Universe"
        ]
      }
    ],
    "History": [
      {
        "ch": "What, Where, How and When?",
        "topics": [
          "Understanding History",
          "Sources of Information",
          "Timeline Concept",
          "Archaeology and Manuscripts"
        ]
      },
      {
        "ch": "From Hunting-Gathering to Growing Food",
        "topics": [
          "Early Human Societies",
          "Hunter-Gatherers",
          "Beginning of Agriculture and Domestication"
        ]
      },
      {
        "ch": "In the Earliest Cities",
        "topics": [
          "Harappan Civilization",
          "Urban Planning",
          "Trade and Crafts",
          "Decline of the Civilization"
        ]
      },
      {
        "ch": "What Books and Burials Tell Us",
        "topics": [
          "Vedic Period",
          "Early Sanskrit",
          "Megaliths",
          "Social Differences"
        ]
      },
      {
        "ch": "Kingdoms, Kings and an Early Republic",
        "topics": [
          "Janapadas and Mahajanapadas",
          "Gana-Sanghas",
          "Magadha",
          "Vajji"
        ]
      },
      {
        "ch": "New Questions and Ideas",
        "topics": [
          "Buddhism",
          "Jainism",
          "The Sangha",
          "Upanishads"
        ]
      },
      {
        "ch": "From a Kingdom to an Empire",
        "topics": [
          "Mauryan Empire",
          "Ashoka",
          "Administration",
          "Kalinga War"
        ]
      },
      {
        "ch": "Villages, Towns and Trade",
        "topics": [
          "Rural Life",
          "Urbanization",
          "Trade Routes",
          "Crafts and Guilds"
        ]
      },
      {
        "ch": "New Empires and Kingdoms",
        "topics": [
          "Gupta Empire",
          "Harshavardhana",
          "Pallavas",
          "Chalukyas"
        ]
      },
      {
        "ch": "Buildings, Paintings and Books",
        "topics": [
          "Temple Architecture",
          "Murals and Frescoes",
          "Sanskrit Literature"
        ]
      }
    ],
    "Geography": [
      {
        "ch": "The Earth in the Solar System",
        "topics": [
          "The Earth",
          "The Moon",
          "The Solar System",
          "Stars and Galaxies"
        ]
      },
      {
        "ch": "Globe: Latitudes and Longitudes",
        "topics": [
          "Globe",
          "Latitudes",
          "Longitudes",
          "Time Zones"
        ]
      },
      {
        "ch": "Maps",
        "topics": [
          "Types of Maps",
          "Scale",
          "Directions",
          "Symbols"
        ]
      },
      {
        "ch": "Major Domains of the Earth",
        "topics": [
          "Lithosphere",
          "Atmosphere",
          "Hydrosphere",
          "Biosphere"
        ]
      }
    ],
    "Civics": [
      {
        "ch": "Diversity and Discrimination",
        "topics": [
          "Understanding Diversity",
          "Prejudice and Discrimination",
          "Struggles for Equality"
        ]
      },
      {
        "ch": "Government",
        "topics": [
          "What is Government?",
          "Types of Government",
          "Key Elements of Democratic Government"
        ]
      }
    ],
    "English": [
      {
        "ch": "Who Did Patrick's Homework?",
        "topics": [
          "Honeysuckle - Prose: A boy's homework done by a little man",
          "Comprehension, Vocabulary, Grammar"
        ]
      },
      {
        "ch": "A House, A Home",
        "topics": [
          "Honeysuckle - Poem: Difference between a house and a home",
          "Poetic devices"
        ]
      },
      {
        "ch": "How the Dog Found Himself a New Master!",
        "topics": [
          "Honeysuckle - Prose: Dog's journey to find a master",
          "Comprehension"
        ]
      },
      {
        "ch": "The Kite",
        "topics": [
          "Honeysuckle - Poem: Description of a kite flying",
          "Imagery"
        ]
      },
      {
        "ch": "Taro's Reward",
        "topics": [
          "Honeysuckle - Prose: Japanese folktale about a woodcutter",
          "Moral values"
        ]
      },
      {
        "ch": "The Quarrel",
        "topics": [
          "Honeysuckle - Poem: Quarrel between siblings",
          "Theme of reconciliation"
        ]
      },
      {
        "ch": "An Indian-American Woman in Space",
        "topics": [
          "Honeysuckle - Prose: Kalpana Chawla's biography",
          "Space exploration"
        ]
      },
      {
        "ch": "Beauty",
        "topics": [
          "Honeysuckle - Poem: Different forms of beauty in nature"
        ]
      },
      {
        "ch": "A Different Kind of School",
        "topics": [
          "Honeysuckle - Prose: Mr. Oliver's unique school",
          "Empathy and understanding"
        ]
      },
      {
        "ch": "Where Do All the Teachers Go?",
        "topics": [
          "Honeysuckle - Poem: Children's curiosity about teachers' lives"
        ]
      },
      {
        "ch": "Who I Am",
        "topics": [
          "Honeysuckle - Prose: Different identities and self-expression"
        ]
      },
      {
        "ch": "The Wonderful Words",
        "topics": [
          "Honeysuckle - Poem: Power of words and language"
        ]
      },
      {
        "ch": "Fair Play",
        "topics": [
          "Honeysuckle - Prose: Story of Jumman and Algu",
          "Justice and friendship"
        ]
      },
      {
        "ch": "A Game of Chance",
        "topics": [
          "Honeysuckle - Prose: Rasheed's experience at a fair",
          "Life lessons"
        ]
      },
      {
        "ch": "Desert Animals",
        "topics": [
          "Honeysuckle - Prose: Life in the desert",
          "Adaptation of animals"
        ]
      },
      {
        "ch": "The Banyan Tree",
        "topics": [
          "Honeysuckle - Prose: author's experience with a banyan tree",
          "Nature observation"
        ]
      },
      {
        "ch": "Supp: A Pact with the Sun",
        "topics": [
          "Supplementary Reader - All 10 stories: The Pact with the Sun, The Friendly Mongoose, etc."
        ]
      }
    ],
    "Hindi": [
      {
        "ch": "वह चिड़िया जो",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 1 - कविता"
        ]
      },
      {
        "ch": "बचपन",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 1 - संस्मरण"
        ]
      },
      {
        "ch": "नादान दोस्त",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 1 - कहानी"
        ]
      },
      {
        "ch": "चाँद से थोड़ी सी गप्पें",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 1 - कविता"
        ]
      },
      {
        "ch": "अक्षरों का महत्व",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 1 - निबंध"
        ]
      },
      {
        "ch": "पार नज़र के",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 1 - कविता"
        ]
      },
      {
        "ch": "साथी हाथ बढ़ाना",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 1 - गीत"
        ]
      },
      {
        "ch": "ईश्वर के दिए वरदान",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 1 - कहानी"
        ]
      },
      {
        "ch": "हमारे मित्र",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 1 - निबंध (पशु-पक्षी)"
        ]
      },
      {
        "ch": "झाँसी की रानी",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 1 - कविता"
        ]
      },
      {
        "ch": "साँप-छुछुंदर की लड़ाई",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 1 - कहानी"
        ]
      },
      {
        "ch": "मेरी पहली उड़ान",
        "topics": [
          "पाठ्यपुस्तक: दूर्वा भाग 1 - संस्मरण"
        ]
      },
      {
        "ch": "सोना और बारिश",
        "topics": [
          "पाठ्यपुस्तक: दूर्वा भाग 1 - कविता"
        ]
      },
      {
        "ch": "बाल साहेब ठाकरे",
        "topics": [
          "पाठ्यपुस्तक: दूर्वा भाग 1 - जीवन परिचय"
        ]
      },
      {
        "ch": "मैं सबसे छोटी होऊँ",
        "topics": [
          "पाठ्यपुस्तक: दूर्वा भाग 1 - कविता"
        ]
      },
      {
        "ch": "चुनौती हिमालय की",
        "topics": [
          "पाठ्यपुस्तक: दूर्वा भाग 1 - यात्रा वृत्तांत"
        ]
      }
    ],
    "Basic Computer": [
      {
        "ch": "Introduction to Computer Systems",
        "topics": [
          "Computer basics: Input, Output, Storage devices",
          "Hardware vs Software",
          "Types of computers",
          "Computer generations",
          "Booting process"
        ]
      },
      {
        "ch": "Operating Systems & File Management",
        "topics": [
          "Introduction to OS (Windows/Linux)",
          "Desktop elements",
          "File and folder management",
          "Recycle Bin",
          "Search and organize files"
        ]
      },
      {
        "ch": "Word Processing Basics",
        "topics": [
          "Creating and saving documents",
          "Formatting text (font, size, color)",
          "Paragraph alignment",
          "Bullets and numbering",
          "Inserting images",
          "Page setup"
        ]
      },
      {
        "ch": "Spreadsheet Basics",
        "topics": [
          "Introduction to spreadsheets",
          "Cells, rows, columns",
          "Entering data",
          "Simple formulas (+, -, *, /)",
          "Creating charts",
          "Cell formatting"
        ]
      },
      {
        "ch": "Presentation Software",
        "topics": [
          "Creating slides",
          "Adding text and images",
          "Slide layouts",
          "Design templates",
          "Slide show view",
          "Basic animation"
        ]
      },
      {
        "ch": "Internet and Email Basics",
        "topics": [
          "What is Internet?",
          "Web browsers",
          "Search engines",
          "Creating email account",
          "Sending/receiving emails",
          "Email etiquette",
          "Safe browsing habits"
        ]
      },
      {
        "ch": "Drawing and Graphics",
        "topics": [
          "Paint/Drawing tools",
          "Basic shapes and colors",
          "Text on images",
          "Saving in different formats",
          "Introduction to digital art"
        ]
      },
      {
        "ch": "Coding Fundamentals (Scratch/Block)",
        "topics": [
          "Introduction to coding logic",
          "Block-based programming (Scratch)",
          "Sequences",
          "Loops (repeat)",
          "Events",
          "Simple games and animations"
        ]
      }
    ]
  },
  "7": {
    "Mathematics": [
      {
        "ch": "Part 1 - Ch 1: Large Numbers Around Us",
        "topics": [
          "Place Value (Indian and International)",
          "Reading and Comparing Large Numbers",
          "Rounding and Approximation",
          "Real-world Numerical Data"
        ]
      },
      {
        "ch": "Part 1 - Ch 2: Arithmetic Expressions",
        "topics": [
          "Brackets",
          "Order of Operations (BODMAS)",
          "Forming and Evaluating Expressions",
          "Comparing Expressions"
        ]
      },
      {
        "ch": "Part 1 - Ch 3: A Peek Beyond the Point",
        "topics": [
          "Decimal Numbers",
          "Tenths, Hundredths and Thousandths",
          "Fraction-to-Decimal Conversion",
          "Ordering Decimals",
          "Measurement Applications"
        ]
      },
      {
        "ch": "Part 1 - Ch 4: Expressions Using Letter-Numbers",
        "topics": [
          "Variables",
          "Constants",
          "Algebraic Expressions",
          "Evaluating Expressions",
          "Terms and Coefficients"
        ]
      },
      {
        "ch": "Part 1 - Ch 5: Parallel and Intersecting Lines",
        "topics": [
          "Vertically Opposite Angles",
          "Angles on a Straight Line",
          "Corresponding Angles",
          "Alternate Angles",
          "Co-interior Angles with Parallel Lines"
        ]
      },
      {
        "ch": "Part 1 - Ch 6: Number Play",
        "topics": [
          "Divisibility Rules",
          "Factors and Multiples",
          "Prime Factorisation",
          "Patterns in Sequences",
          "Properties of Special Numbers"
        ]
      },
      {
        "ch": "Part 1 - Ch 7: A Tale of Three Intersecting Lines",
        "topics": [
          "Types of Triangles by Sides and Angles",
          "Angle Sum Property",
          "Exterior Angle Theorem",
          "Triangle Inequality"
        ]
      },
      {
        "ch": "Part 1 - Ch 8: Working with Fractions",
        "topics": [
          "Addition and Subtraction of Unlike Fractions",
          "Multiplication and Division of Fractions",
          "Reciprocals",
          "Mixed Numbers"
        ]
      },
      {
        "ch": "Part 2 - Ch 9: Operations on Integers",
        "topics": [
          "Number Line",
          "Additive Inverse",
          "Rules of Signs in Multiplication and Division",
          "Properties (Commutative, Associative, Distributive)"
        ]
      },
      {
        "ch": "Part 2 - Ch 10: Fractions and Proportional Reasoning",
        "topics": [
          "Equivalent Ratios",
          "Unitary Method",
          "Percentage Calculations",
          "Comparing Quantities",
          "Proportional Relationships"
        ]
      },
      {
        "ch": "Part 2 - Ch 11: Finding the Unknown",
        "topics": [
          "Structure of Equation",
          "Balancing Method",
          "Transposition",
          "Forming Equations from Word Problems",
          "Verifying Solutions"
        ]
      },
      {
        "ch": "Part 2 - Ch 12: Congruent Figures",
        "topics": [
          "Meaning of Congruence",
          "SSS, SAS, ASA, RHS Criteria",
          "Corresponding Vertices"
        ]
      },
      {
        "ch": "Part 2 - Ch 13: Visualising Solid Shapes",
        "topics": [
          "3D Shapes",
          "Nets",
          "Top/Front/Side Views",
          "Relationship between 2D Drawings and 3D Objects"
        ]
      },
      {
        "ch": "Part 2 - Ch 14: Comparing Quantities",
        "topics": [
          "Percentage-based Calculations",
          "Profit and Loss",
          "Marked Price and Discount",
          "Simple Interest"
        ]
      },
      {
        "ch": "Part 2 - Ch 15: Data Handling",
        "topics": [
          "Types of Data",
          "Arithmetic Mean, Mode, Median",
          "Range",
          "Bar Graphs",
          "Drawing Conclusions from Data"
        ]
      },
      {
        "ch": "Part 2 - Ch 16: Symmetry",
        "topics": [
          "Lines of Symmetry",
          "Rotational Symmetry",
          "Order and Angle of Rotation",
          "Symmetry in Nature and Art"
        ]
      }
    ],
    "Science": [
      {
        "ch": "The Ever-Evolving World of Science",
        "topics": [
          "Happy Exploring"
        ]
      },
      {
        "ch": "Exploring Substances: Acidic, Basic, and Neutral",
        "topics": [
          "Nature as Science Laboratory",
          "Litmus Indicator",
          "Red Rose and Turmeric as Indicators",
          "Acid-Base Reactions",
          "Neutralisation in Daily Life"
        ]
      },
      {
        "ch": "Electricity: Circuits and their Components",
        "topics": [
          "Torchlight",
          "Simple Electrical Circuit",
          "Electric Cell and Battery",
          "Electric Lamp and Switch",
          "Circuit Diagrams",
          "Conductors and Insulators"
        ]
      },
      {
        "ch": "The World of Metals and Non-metals",
        "topics": [
          "Properties of Materials",
          "Malleability and Ductility",
          "Conduction of Heat and Electricity",
          "Effect of Air and Water on Metals",
          "Importance of Metals"
        ]
      },
      {
        "ch": "Changes Around Us: Physical and Chemical",
        "topics": [
          "Physical vs Chemical Changes",
          "Rusting",
          "Combustion",
          "Weathering and Erosion",
          "Desirable and Undesirable Changes"
        ]
      },
      {
        "ch": "Adolescence - A Stage of Growth and Change",
        "topics": [
          "Teenage Years",
          "Reproductive Capability",
          "Emotional and Behavioural Changes",
          "Nutrition and Hygiene",
          "Balanced Lifestyle",
          "Avoiding Harmful Substances"
        ]
      },
      {
        "ch": "Heat Transfer in Nature",
        "topics": [
          "Heat Conduction",
          "Convection",
          "Radiation",
          "Land and Sea Breeze",
          "Water Cycle",
          "Underground Water Seepage"
        ]
      },
      {
        "ch": "Measurement of Time and Motion",
        "topics": [
          "Pendulum",
          "SI Unit of Time",
          "Speed",
          "Distance-Time Relationship",
          "Uniform and Non-Uniform Motion"
        ]
      },
      {
        "ch": "Life Processes in Animals",
        "topics": [
          "Nutrition and Digestion in Animals",
          "Respiration in Humans and Animals"
        ]
      },
      {
        "ch": "Life Processes in Plants",
        "topics": [
          "Plant Growth",
          "Photosynthesis",
          "Gas Exchange",
          "Water and Mineral Transport",
          "Food Transport",
          "Respiration in Plants"
        ]
      },
      {
        "ch": "Light - Shadows and Reflections",
        "topics": [
          "Sources of Light",
          "Shadow Formation",
          "Reflection",
          "Periscope",
          "Kaleidoscope",
          "Pinhole Camera"
        ]
      },
      {
        "ch": "Earth, Moon, and the Sun",
        "topics": [
          "Rotation and Revolution of Earth",
          "Seasons",
          "Eclipses",
          "Night Sky Observations"
        ]
      }
    ],
    "History": [
      {
        "ch": "Tracing Changes Through a Thousand Years",
        "topics": [
          "Medieval Period",
          "Historical Sources",
          "New Social and Political Groups"
        ]
      },
      {
        "ch": "New Kings and Kingdoms",
        "topics": [
          "Rise of New Dynasties",
          "Administration",
          "Warfare",
          "Prashastis and Land Grants"
        ]
      },
      {
        "ch": "The Delhi Sultans",
        "topics": [
          "Delhi Sultanate",
          "Administration",
          "Alauddin Khalji",
          "Muhammad Tughluq"
        ]
      },
      {
        "ch": "The Mughal Empire",
        "topics": [
          "Babur, Akbar, Aurangzeb",
          "Mansabdari System",
          "Mughal Administration",
          "Culture"
        ]
      },
      {
        "ch": "Rulers and Buildings",
        "topics": [
          "Engineering Skills",
          "Temples, Mosques, Tombs",
          "Regional Styles"
        ]
      },
      {
        "ch": "Towns, Traders and Craftspersons",
        "topics": [
          "Types of Towns",
          "Trade Networks",
          "Crafts and Craftspersons",
          "Hampi, Masulipatnam, Surat"
        ]
      },
      {
        "ch": "Tribes, Nomads and Settled Communities",
        "topics": [
          "Tribal Societies",
          "Nomadic Pastoralists",
          "Van Gujjars, Khokhars",
          "Interactions with Society"
        ]
      },
      {
        "ch": "Devotional Paths to the Divine",
        "topics": [
          "Bhakti Movement",
          "Sufism",
          "Alvars and Nayanars",
          "Kabir, Guru Nanak"
        ]
      },
      {
        "ch": "The Making of Regional Cultures",
        "topics": [
          "Regional Languages",
          "Literature",
          "Painting",
          "Architecture"
        ]
      },
      {
        "ch": "Eighteenth-Century Political Formations",
        "topics": [
          "Crisis of Mughal Empire",
          "Independent Kingdoms",
          "British Expansion"
        ]
      }
    ],
    "Geography": [
      {
        "ch": "Environment",
        "topics": [
          "Ecosystem",
          "Components of Environment",
          "Natural and Human Environment"
        ]
      },
      {
        "ch": "Inside Our Earth",
        "topics": [
          "Interior of the Earth",
          "Rocks",
          "Minerals",
          "Volcanoes and Earthquakes"
        ]
      },
      {
        "ch": "Our Changing Earth",
        "topics": [
          "Weathering and Erosion",
          "Landforms: Work of River, Wind, Sea Ice"
        ]
      },
      {
        "ch": "Air",
        "topics": [
          "Atmosphere",
          "Composition",
          "Weather and Climate",
          "Pressure and Wind Systems"
        ]
      },
      {
        "ch": "Water",
        "topics": [
          "Water Cycle",
          "Ocean Circulation",
          "Tides and Waves"
        ]
      },
      {
        "ch": "Natural Vegetation and Wildlife",
        "topics": [
          "Types of Forests",
          "Grasslands",
          "Deserts",
          "Conservation"
        ]
      },
      {
        "ch": "Human Environment - Settlement, Transport and Communication",
        "topics": [
          "Rural and Urban Settlements",
          "Transport and Communication Networks"
        ]
      },
      {
        "ch": "Human Environment Interactions - The Tropical and the Subtropical Regions",
        "topics": [
          "Life in the Amazon Basin",
          "Life in the Ganga-Brahmaputra Basin"
        ]
      },
      {
        "ch": "Life in the Deserts",
        "topics": [
          "Sahara Desert",
          "Ladakh",
          "Adaptation to Desert Life"
        ]
      }
    ],
    "Civics": [
      {
        "ch": "On Equality",
        "topics": [
          "Equality in Indian Democracy",
          "Mid-day Meal Scheme",
          "Recognizing Dignity"
        ]
      },
      {
        "ch": "Role of the Government in Health",
        "topics": [
          "Healthcare in India",
          "Public and Private Healthcare",
          "Health Initiatives"
        ]
      },
      {
        "ch": "How the State Government Works",
        "topics": [
          "MLAs and Legislature",
          "Chief Minister and Council of Ministers",
          "Assembly"
        ]
      },
      {
        "ch": "Growing up as Boys and Girls",
        "topics": [
          "Gender Roles",
          "Stereotypes",
          "Valuing Housework",
          "Equality in Society"
        ]
      },
      {
        "ch": "Women Change the World",
        "topics": [
          "Women's Movement",
          "Breaking Stereotypes",
          "Fighting Discrimination"
        ]
      },
      {
        "ch": "Understanding Media",
        "topics": [
          "Media and Democracy",
          "Advertising",
          "Media and Money"
        ]
      },
      {
        "ch": "Understanding Advertising",
        "topics": [
          "Advertising and Democracy",
          "Creating Ads",
          "Brand Values"
        ]
      },
      {
        "ch": "Markets Around Us",
        "topics": [
          "Types of Markets",
          "Chain of Markets",
          "Fair Price Shops"
        ]
      },
      {
        "ch": "A Shirt in the Market",
        "topics": [
          "Garment Export",
          "Chain of Markets",
          "Fair Trade"
        ]
      }
    ],
    "English": [
      {
        "ch": "Three Questions",
        "topics": [
          "Honeycomb - Prose: Leo Tolstoy's story about a king seeking answers",
          "Wisdom and compassion"
        ]
      },
      {
        "ch": "The Squirrel",
        "topics": [
          "Honeycomb - Poem: Description of a squirrel's playful nature"
        ]
      },
      {
        "ch": "A Gift of Chappals",
        "topics": [
          "Honeycomb - Prose: Story about children's kindness",
          "Humor and empathy"
        ]
      },
      {
        "ch": "The Rebel",
        "topics": [
          "Honeycomb - Poem: Characteristics of a rebel",
          "Non-conformity"
        ]
      },
      {
        "ch": "Gopal and the Hilsa-Fish",
        "topics": [
          "Honeycomb - Prose: Akbar-Birbal tale",
          "Wit and wisdom"
        ]
      },
      {
        "ch": "The Shed",
        "topics": [
          "Honeycomb - Poem: A mysterious shed",
          "Imagination"
        ]
      },
      {
        "ch": "The Ashes That Made Trees Bloom",
        "topics": [
          "Honeycomb - Prose: Japanese folktale",
          "Greed and gratitude"
        ]
      },
      {
        "ch": "Chivvy",
        "topics": [
          "Honeycomb - Poem: Adults' constant instructions",
          "Growing up"
        ]
      },
      {
        "ch": "Quality",
        "topics": [
          "Honeycomb - Prose: Story of a shoemaker",
          "Craftsmanship and integrity"
        ]
      },
      {
        "ch": "Trees",
        "topics": [
          "Honeycomb - Poem: Importance of trees",
          "Nature"
        ]
      },
      {
        "ch": "Expert Detectives",
        "topics": [
          "Honeycomb - Prose: Mystery story",
          "Observation and deduction"
        ]
      },
      {
        "ch": "Mystery of the Talking Fan",
        "topics": [
          "Honeycomb - Poem: Personification of a fan",
          "Mystery"
        ]
      },
      {
        "ch": "The Invention of Vita-Wonk",
        "topics": [
          "Honeycomb - Prose: Roald Dahl story",
          "Science fiction"
        ]
      },
      {
        "ch": "Dad and the Cat and the Tree",
        "topics": [
          "Honeycomb - Poem: Humorous poem about dad's attempts"
        ]
      },
      {
        "ch": "Fire: Friend and Foe",
        "topics": [
          "Honeycomb - Prose: Discovery of fire",
          "Uses and dangers"
        ]
      },
      {
        "ch": "Meadow Surprises",
        "topics": [
          "Honeycomb - Poem: Life in a meadow",
          "Observation"
        ]
      },
      {
        "ch": "A Bicycle in Good Repair",
        "topics": [
          "Honeycomb - Prose: Father-son bicycle repair",
          "Humor"
        ]
      },
      {
        "ch": "The Story of Cricket",
        "topics": [
          "Honeycomb - Prose: History of cricket",
          "Evolution of the game"
        ]
      },
      {
        "ch": "Supp: An Alien Hand",
        "topics": [
          "Supplementary Reader - All 10 stories including The Tiny Teacher, Bringing up Kari, The Desert, etc."
        ]
      }
    ],
    "Hindi": [
      {
        "ch": "हम पंछी उन्मुक्त गगन के",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 2 - कविता (सुमित्रानंदन पंत)"
        ]
      },
      {
        "ch": "संकल्प",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 2 - कविता (सूर्यकांत त्रिपाठी निराला)"
        ]
      },
      {
        "ch": "खिलौनेवाला",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 2 - कविता (सर्वेश्वर दयाल सक्सेना)"
        ]
      },
      {
        "ch": "अपRvापति",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 2 - कहानी (हरिशंकर परसाई)"
        ]
      },
      {
        "ch": "मीठाईवाला",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 2 - कहानी (मोहन राकेश)"
        ]
      },
      {
        "ch": "सत्ता का परिवर्तन",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 2 - नाटक"
        ]
      },
      {
        "ch": "कंचा",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 2 - कहानी"
        ]
      },
      {
        "ch": "एक गुजराती की सादगी",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 2 - निबंध (काका कालेलकर)"
        ]
      },
      {
        "ch": "मधुर-मधुर मेरे दीपक जल",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 2 - कविता (मैथिलीशरण गुप्त)"
        ]
      },
      {
        "ch": "पापा खो गए",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 2 - निबंध"
        ]
      },
      {
        "ch": "शाम एक किशान",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 2 - कविता (सर्वेश्वर दयाल सक्सेना)"
        ]
      },
      {
        "ch": "खिलौना",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 2 - कविता"
        ]
      },
      {
        "ch": "मीठी वानी",
        "topics": [
          "पाठ्यपुस्तक: दूर्वा भाग 2 - कहानी"
        ]
      },
      {
        "ch": "लेखक परिचय और रचनाएँ",
        "topics": [
          "पाठ्यपुस्तक: दूर्वा भाग 2 - साहित्यिक अध्ययन"
        ]
      },
      {
        "ch": "व्याकरण: संज्ञा, सर्वनाम, विशेषण",
        "topics": [
          "व्याकरण अध्याय"
        ]
      },
      {
        "ch": "व्याकरण: क्रिया, काल, वाच्य",
        "topics": [
          "व्याकरण अध्याय"
        ]
      }
    ],
    "Basic Computer": [
      {
        "ch": "Advanced Word Processing",
        "topics": [
          "Styles and templates",
          "Table of contents",
          "Mail merge",
          "Track changes",
          "Comments",
          "Headers and footers",
          "Tabs and indents",
          "Document collaboration"
        ]
      },
      {
        "ch": "Advanced Spreadsheets",
        "topics": [
          "Functions: SUM, AVERAGE, COUNT, MAX, MIN",
          "Sorting and filtering data",
          "Conditional formatting",
          "Advanced charts (pie, bar, line)",
          "Cell references (relative/absolute)"
        ]
      },
      {
        "ch": "Advanced Presentations",
        "topics": [
          "Master slides",
          "Action buttons",
          "Hyperlinks",
          "Multimedia integration (audio/video)",
          "Export formats",
          "Presentation best practices"
        ]
      },
      {
        "ch": "Database Concepts",
        "topics": [
          "What is a database?",
          "Tables, records, fields",
          "Primary key",
          "Creating simple database (LibreOffice Base/MS Access)",
          "Sorting and querying",
          "Forms and reports"
        ]
      },
      {
        "ch": "Introduction to HTML",
        "topics": [
          "HTML structure: html, head, body",
          "Common tags: p, h1-h6, img, a, table, ul, ol",
          "Adding images and links",
          "Creating a simple web page",
          "Introduction to CSS"
        ]
      },
      {
        "ch": "Cyber Safety and Ethics",
        "topics": [
          "Cyberbullying awareness",
          "Digital footprint",
          "Password security",
          "Copyright and plagiarism",
          "Netiquette",
          "Safe social media usage",
          "Information literacy"
        ]
      },
      {
        "ch": "Scratch Programming II",
        "topics": [
          "Variables in Scratch",
          "Conditional blocks (if-then)",
          "Sensing blocks",
          "Operators",
          "Broadcasting",
          "Creating interactive stories and games",
          "Debugging"
        ]
      },
      {
        "ch": "Emerging Technologies",
        "topics": [
          "Introduction to AI and Machine Learning",
          "Robotics basics",
          "Internet of Things (IoT)",
          "3D printing concepts",
          "Virtual Reality overview"
        ]
      }
    ]
  },
  "8": {
    "Mathematics": [
      {
        "ch": "Rational Numbers",
        "topics": [
          "Introduction",
          "Properties of Rational Numbers",
          "Representation on Number Line",
          "Rational Numbers between Two Rational Numbers"
        ]
      },
      {
        "ch": "Linear Equations in One Variable",
        "topics": [
          "Introduction",
          "Solving Equations",
          "Applications",
          "Reducing Equations to Simpler Form"
        ]
      },
      {
        "ch": "Understanding Quadrilaterals",
        "topics": [
          "Polygons",
          "Types of Quadrilaterals",
          "Properties of Parallelograms",
          "Special Parallelograms"
        ]
      },
      {
        "ch": "Practical Geometry",
        "topics": [
          "Constructing a Quadrilateral",
          "Special Cases"
        ]
      },
      {
        "ch": "Data Handling",
        "topics": [
          "Looking for Information",
          "Organising Data",
          "Grouping Data",
          "Circle Graph or Pie Chart",
          "Chance and Probability"
        ]
      },
      {
        "ch": "Squares and Square Roots",
        "topics": [
          "Properties of Square Numbers",
          "Finding Square and Square Roots",
          "Square Roots of Decimals",
          "Estimating Square Root"
        ]
      },
      {
        "ch": "Cubes and Cube Roots",
        "topics": [
          "Cubes",
          "Cube Roots"
        ]
      },
      {
        "ch": "Comparing Quantities",
        "topics": [
          "Recalling Ratios and Percentages",
          "Finding Increase or Decrease Percent",
          "Discount",
          "Prices Related to Buying and Selling",
          "Compound Interest"
        ]
      },
      {
        "ch": "Algebraic Expressions and Identities",
        "topics": [
          "Expressions",
          "Terms, Factors and Coefficients",
          "Monomials, Binomials, Trinomials",
          "Addition and Subtraction",
          "Multiplication",
          "Identities"
        ]
      },
      {
        "ch": "Visualising Solid Shapes",
        "topics": [
          "Views of 3D Shapes",
          "Mapping Space Around Us",
          "Faces, Edges and Vertices"
        ]
      },
      {
        "ch": "Mensuration",
        "topics": [
          "Area of Trapezium, Quadrilateral, Polygon",
          "Surface Area and Volume of Cube, Cuboid and Cylinder"
        ]
      },
      {
        "ch": "Exponents and Powers",
        "topics": [
          "Powers with Negative Exponents",
          "Laws of Exponents",
          "Use of Exponents to Express Small Numbers in Standard Form"
        ]
      },
      {
        "ch": "Direct and Inverse Proportions",
        "topics": [
          "Direct Proportion",
          "Inverse Proportion"
        ]
      },
      {
        "ch": "Factorisation",
        "topics": [
          "Factors of Natural Numbers and Algebraic Expressions",
          "Factorisation by Regrouping",
          "Division of Algebraic Expressions"
        ]
      },
      {
        "ch": "Introduction to Graphs",
        "topics": [
          "Linear Graphs",
          "Application of Graphs"
        ]
      },
      {
        "ch": "Playing with Numbers",
        "topics": [
          "Numbers in General Form",
          "Games with Numbers",
          "Letters for Digits",
          "Tests of Divisibility"
        ]
      }
    ],
    "Science": [
      {
        "ch": "Exploring the Investigative World of Science",
        "topics": [
          "Exploring the Investigative World of Science"
        ]
      },
      {
        "ch": "The Invisible Living World: Beyond Our Naked Eye",
        "topics": [
          "What is a Cell?",
          "Levels of Organisation in the Body",
          "Microorganisms",
          "How Are We Connected to Microbes?",
          "Cell as Basic Unit of Life"
        ]
      },
      {
        "ch": "Health: The Ultimate Treasure",
        "topics": [
          "Health: More Than Not Falling Sick",
          "How to Stay Healthy",
          "Causes and Types of Diseases",
          "Prevention and Control of Diseases"
        ]
      },
      {
        "ch": "Electricity: Magnetic and Heating Effects",
        "topics": [
          "Does an Electric Current Have a Magnetic Effect?",
          "Does a Current Carrying Wire Get Hot?",
          "How Does a Battery Generate Electricity?"
        ]
      },
      {
        "ch": "Exploring Forces",
        "topics": [
          "What is a Force?",
          "What Can a Force Do?",
          "Types of Forces",
          "Weight and Its Measurement",
          "Floating and Sinking"
        ]
      },
      {
        "ch": "Pressure, Winds, Storms, and Cyclones",
        "topics": [
          "Pressure",
          "Pressure Exerted by Air",
          "Formation of Wind",
          "Storms, Thunderstorms, and Lightning",
          "Cyclones"
        ]
      },
      {
        "ch": "Particulate Nature of Matter",
        "topics": [
          "What is Matter Composed of?",
          "States of Matter",
          "Interparticle Spacing",
          "Particle Movement in Different States"
        ]
      },
      {
        "ch": "Nature of Matter: Elements, Compounds, and Mixtures",
        "topics": [
          "Mixtures",
          "Pure Substances",
          "Types of Pure Substances",
          "Elements, Compounds, and Mixtures",
          "Minerals"
        ]
      },
      {
        "ch": "The Amazing World of Solutes, Solvents and Solutions",
        "topics": [
          "Solute, Solvent, and Solution",
          "Solubility",
          "Why Objects Float or Sink in Water",
          "Density"
        ]
      },
      {
        "ch": "Light: Mirrors and Lenses",
        "topics": [
          "Spherical Mirrors",
          "Characteristics of Images",
          "Laws of Reflection",
          "Lenses"
        ]
      },
      {
        "ch": "Keeping Time with the Skies",
        "topics": [
          "Moon's Appearance and Phases",
          "How Did Calendars Come into Existence?",
          "Festivals Related to Astronomical Phenomena",
          "Artificial Satellites"
        ]
      },
      {
        "ch": "How Nature Works in Harmony",
        "topics": [
          "Experiencing Surroundings",
          "Types of Interactions Among Organisms",
          "Food Chains",
          "Waste in Nature",
          "Balance in Ecosystems"
        ]
      },
      {
        "ch": "Our Home: Earth, a Unique Life Sustaining Planet",
        "topics": [
          "Why is Earth Unique?",
          "Planets of Our Solar System",
          "What Makes Earth Suitable for Life?",
          "Threats to Life on Earth"
        ]
      }
    ],
    "History": [
      {
        "ch": "How, When and Where",
        "topics": [
          "Importance of Dates",
          "British Raj",
          "Sources of History",
          "Survey and Mapping"
        ]
      },
      {
        "ch": "From Trade to Territory",
        "topics": [
          "East India Company",
          "Arrival in India",
          "Battle of Plassey",
          "Expansion of Rule"
        ]
      },
      {
        "ch": "Ruling the Countryside",
        "topics": [
          "Bengal Presidency",
          "Permanent Settlement",
          "Ryotwari System",
          "Mahalwari System"
        ]
      },
      {
        "ch": "Tribals, Dikus and the Vision of a Golden Age",
        "topics": [
          "Tribal Societies",
          "Birsa Munda",
          "Revolts",
          "Impact of Colonial Rule"
        ]
      },
      {
        "ch": "When People Rebel (1857)",
        "topics": [
          "The Revolt of 1857",
          "Causes",
          "Leaders",
          "Consequences"
        ]
      },
      {
        "ch": "Civilising the 'Native', Educating the Nation",
        "topics": [
          "British Education Policy",
          "Orientalists vs Anglicists",
          "Macaulay's Minute"
        ]
      },
      {
        "ch": "Women, Caste and Reform",
        "topics": [
          "Social Reform Movements",
          "Women's Education",
          "Caste System",
          "Reformers"
        ]
      },
      {
        "ch": "The Making of the National Movement (1870s-1947)",
        "topics": [
          "Congress",
          "Partition of Bengal",
          "Non-Cooperation",
          "Civil Disobedience",
          "Quit India",
          "Independence"
        ]
      }
    ],
    "Geography": [
      {
        "ch": "Resources",
        "topics": [
          "Types of Resources",
          "Natural and Human Resources",
          "Conservation of Resources"
        ]
      },
      {
        "ch": "Land, Soil, Water, Natural Vegetation and Wildlife Resources",
        "topics": [
          "Land Use and Conservation",
          "Soil Types and Conservation",
          "Water Resources",
          "Natural Vegetation and Wildlife"
        ]
      },
      {
        "ch": "Agriculture",
        "topics": [
          "Types of Farming",
          "Cropping Patterns",
          "Major Crops",
          "Food Security"
        ]
      },
      {
        "ch": "Industries",
        "topics": [
          "Classification of Industries",
          "Factors Affecting Location",
          "Major Industries",
          "Industrial Pollution"
        ]
      },
      {
        "ch": "Human Resources",
        "topics": [
          "Population",
          "Distribution",
          "Density",
          "Population Change",
          "Human Resource Development"
        ]
      }
    ],
    "Civics": [
      {
        "ch": "The Indian Constitution",
        "topics": [
          "Why Does a Country Need a Constitution?",
          "Key Features of Indian Constitution"
        ]
      },
      {
        "ch": "Understanding Secularism",
        "topics": [
          "What is Secularism?",
          "Indian Secularism"
        ]
      },
      {
        "ch": "Parliament and the Making of Laws",
        "topics": [
          "Why Do We Need a Parliament?",
          "Two Houses of Parliament",
          "Law-making Process"
        ]
      },
      {
        "ch": "Judiciary",
        "topics": [
          "Role of the Judiciary",
          "Supreme Court and High Courts",
          "Judicial Review",
          "PIL"
        ]
      },
      {
        "ch": "Understanding Marginalisation",
        "topics": [
          "Who are Marginalised?",
          "Marginalisation and Minorities",
          "Adivasis"
        ]
      },
      {
        "ch": "Confronting Marginalisation",
        "topics": [
          "Laws Protecting Marginalised",
          "Promoting Social Justice"
        ]
      },
      {
        "ch": "Public Facilities",
        "topics": [
          "Role of Government",
          "Water as Public Facility",
          "Availability and Distribution"
        ]
      },
      {
        "ch": "Law and Social Justice",
        "topics": [
          "Welfare Laws",
          "Market and Exploitation",
          "Enforcement of Laws"
        ]
      }
    ],
    "English": [
      {
        "ch": "The Best Christmas Present in the World",
        "topics": [
          "Honeydew - Prose: Christmas truce story",
          "War and peace"
        ]
      },
      {
        "ch": "The Ant and the Cricket",
        "topics": [
          "Honeydew - Poem: Fable about hard work and preparation"
        ]
      },
      {
        "ch": "The Tsunami",
        "topics": [
          "Honeydew - Prose: Tsunami stories from Andaman and Nicobar",
          "Survival and courage"
        ]
      },
      {
        "ch": "Geography Lesson",
        "topics": [
          "Honeydew - Poem: Aerial view of earth",
          "Perspective"
        ]
      },
      {
        "ch": "Glimpses of the Past",
        "topics": [
          "Honeydew - Prose: India's history from 1757 to 1857",
          "Freedom struggle"
        ]
      },
      {
        "ch": "Macavity: The Mystery Cat",
        "topics": [
          "Honeydew - Poem: T.S. Eliot's poem about a clever cat"
        ]
      },
      {
        "ch": "Bepin Choudhury's Lapse of Memory",
        "topics": [
          "Honeydew - Prose: Mystery story by Satyajit Ray",
          "Memory and identity"
        ]
      },
      {
        "ch": "The Last Bargain",
        "topics": [
          "Honeydew - Poem: Tagore's poem about finding true value"
        ]
      },
      {
        "ch": "The Summit Within",
        "topics": [
          "Honeydew - Prose: Mountaineering",
          "Physical and mental challenges"
        ]
      },
      {
        "ch": "The School Boy",
        "topics": [
          "Honeydew - Poem: Blake's poem about school and freedom"
        ]
      },
      {
        "ch": "This is Jody's Fawn",
        "topics": [
          "Honeydew - Prose: Story about compassion for animals"
        ]
      },
      {
        "ch": "A Visit to Cambridge",
        "topics": [
          "Honeydew - Prose: Meeting Stephen Hawking",
          "Disability and achievement"
        ]
      },
      {
        "ch": "A Short Monsoon Diary",
        "topics": [
          "Honeydew - Prose: Ruskin Bond's diary entries",
          "Nature observations"
        ]
      },
      {
        "ch": "On the Grasshopper and Cricket",
        "topics": [
          "Honeydew - Poem: Keats' poem about nature's music"
        ]
      },
      {
        "ch": "The Great Stone Face-I",
        "topics": [
          "Honeydew - Prose: Nathaniel Hawthorne's tale"
        ]
      },
      {
        "ch": "The Great Stone Face-II",
        "topics": [
          "Honeydew - Prose: Conclusion of the story"
        ]
      },
      {
        "ch": "Supp: The Selfish Giant",
        "topics": [
          "It So Happened - Oscar Wilde's story",
          "Kindness and redemption"
        ]
      },
      {
        "ch": "Supp: The Treasure Within",
        "topics": [
          "It So Happened - Hafeez Contractor's story",
          "Unconventional success"
        ]
      }
    ],
    "Hindi": [
      {
        "ch": "गुड़िया",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 3 - कविता"
        ]
      },
      {
        "ch": "दो गौरैया",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 3 - कहानी"
        ]
      },
      {
        "ch": "सबसे सुंदर लड़की",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 3 - निबंध"
        ]
      },
      {
        "ch": "मैं सबसे छोटी होऊँ",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 3 - कविता"
        ]
      },
      {
        "ch": "पंछी की आत्मकथा",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 3 - कविता (पंछी का दृष्टिकोण)"
        ]
      },
      {
        "ch": "बड़े भाई साहब",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 3 - कहानी (प्रेमचंद)"
        ]
      },
      {
        "ch": "डायरी का एक पन्ना",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 3 - डायरी"
        ]
      },
      {
        "ch": "तुम कब जाओगे अतिथि",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 3 - कविता (दुष्यंत कुमार)"
        ]
      },
      {
        "ch": "वज़न का रहस्य",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 3 - निबंध"
        ]
      },
      {
        "ch": "सूर के पद",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 3 - दोहे (सूरदास)"
        ]
      },
      {
        "ch": "कबीर की साखियाँ",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 3 - दोहे (कबीर)"
        ]
      },
      {
        "ch": "मीरा के पद",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 3 - भजन (मीराबाई)"
        ]
      },
      {
        "ch": "रहीम के दोहे",
        "topics": [
          "पाठ्यपुस्तक: वसंत भाग 3 - दोहे (अब्दुर रहीम खानखाना)"
        ]
      },
      {
        "ch": "छोटी का कमाल",
        "topics": [
          "पाठ्यपुस्तक: दूर्वा भाग 3 - कहानी"
        ]
      },
      {
        "ch": "व्याकरण: वाक्य, अलंकार, मुहावरे",
        "topics": [
          "व्याकरण अध्याय"
        ]
      },
      {
        "ch": "व्याकरण: पत्र लेखन, निबंध लेखन",
        "topics": [
          "व्याकरण अध्याय"
        ]
      }
    ],
    "Basic Computer": [
      {
        "ch": "Digital Documentation (Advanced)",
        "topics": [
          "Advanced formatting",
          "Macros",
          "Document collaboration tools",
          "Cloud-based docs (Google Docs/Office 365)",
          "Version control",
          "Citations and bibliography"
        ]
      },
      {
        "ch": "Electronic Spreadsheet (Advanced)",
        "topics": [
          "Advanced functions: IF, COUNTIF, SUMIF, VLOOKUP",
          "Data validation",
          "Pivot tables",
          "Data analysis",
          "What-if scenarios",
          "Protecting sheets",
          "Import/export data"
        ]
      },
      {
        "ch": "Database Management (SQL Basics)",
        "topics": [
          "Introduction to RDBMS",
          "SQL commands: CREATE, INSERT, SELECT, UPDATE, DELETE",
          "WHERE clause",
          "ORDER BY",
          "Aggregate functions (COUNT, SUM, AVG)",
          "Data types and constraints"
        ]
      },
      {
        "ch": "Web Applications",
        "topics": [
          "Web browsers and search engines",
          "Blogs and wikis",
          "Social networks",
          "E-commerce",
          "Online banking",
          "Digital signatures",
          "Cloud storage services"
        ]
      },
      {
        "ch": "Python Programming Basics",
        "topics": [
          "Python introduction",
          "Variables and data types (int, float, str, bool)",
          "Input/output",
          "Operators",
          "Conditional statements (if-elif-else)",
          "Loops (for, while)",
          "Simple programs"
        ]
      },
      {
        "ch": "HTML and Web Design",
        "topics": [
          "HTML5 semantic tags",
          "Tables and forms",
          "CSS3 basics: selectors, colors, fonts, box model",
          "Responsive design concepts",
          "Creating a multi-page website"
        ]
      },
      {
        "ch": "Cyber Ethics and Safety",
        "topics": [
          "Cyber crimes and prevention",
          "Digital wellness",
          "Identity protection",
          "Malware and antivirus",
          "Information security",
          "India's IT Act overview",
          "Reporting cyber crimes"
        ]
      },
      {
        "ch": "AI and Future Technologies",
        "topics": [
          "AI applications in daily life",
          "Machine learning basics",
          "Chatbots",
          "Data privacy",
          "Ethical AI",
          "Career opportunities in technology"
        ]
      }
    ]
  },
  "9": {
    "Mathematics": [
      {
        "ch": "Orienting Yourself: The Use of Coordinates",
        "topics": [
          "Introduction to Coordinates",
          "Settling In with Position",
          "The 2-D Cartesian Coordinate System",
          "Distance Between Two Points in the 2-D Plane"
        ]
      },
      {
        "ch": "Introduction to Linear Polynomials",
        "topics": [
          "Linear Polynomials",
          "Exploring Linear Patterns",
          "Linear Relationships",
          "Visualising Linear Relationships"
        ]
      },
      {
        "ch": "The World of Numbers",
        "topics": [
          "History of Number Systems",
          "Zero and Integers",
          "Rational Numbers on the Number Line",
          "Irrational Numbers",
          "Real Numbers and Decimal Patterns"
        ]
      },
      {
        "ch": "Exploring Algebraic Identities",
        "topics": [
          "Visualising Identities",
          "Algebra Tiles",
          "Factorisation of Algebraic Expressions",
          "Factorisation Without Algebra Tiles",
          "Simplifying Rational Expressions"
        ]
      },
      {
        "ch": "I'm Up and Down, and Round and Round",
        "topics": [
          "Circle Definitions",
          "Symmetries of a Circle",
          "Chords and Angles",
          "Perpendicular Bisectors of Chords",
          "Angles Subtended by an Arc",
          "Concyclic Points"
        ]
      },
      {
        "ch": "Measuring Space: Perimeter and Area",
        "topics": [
          "Perimeter of Shapes",
          "Circumference and Pi",
          "Arc Length",
          "Area of Rectangles, Parallelograms, and Triangles",
          "Heron's Formula",
          "Area of Circle and Sector"
        ]
      },
      {
        "ch": "The Mathematics of Maybe: Introduction to Probability",
        "topics": [
          "What is Probability",
          "Randomness and the Probability Scale",
          "Experimental Probability",
          "Theoretical Probability",
          "Sample Space and Events",
          "Tree Diagrams"
        ]
      },
      {
        "ch": "Predicting What Comes Next: Exploring Sequences and Progressions",
        "topics": [
          "Introduction to Sequences",
          "Explicit Rule for a Sequence",
          "Recursive Rule for a Sequence",
          "Arithmetic Progressions",
          "Sum of the First n Natural Numbers",
          "Geometric Progressions"
        ]
      }
    ],
    "Science": [
      {
        "ch": "Exploration: Entering the World of Secondary Science",
        "topics": [
          "Scientific Inquiry",
          "Observation and Evidence",
          "Measurement and Models",
          "Interdisciplinary Science"
        ]
      },
      {
        "ch": "Cell: The Building Block of Life",
        "topics": [
          "Cell as Basic Unit",
          "Cell Membrane and Cell Wall",
          "Nucleus and Cytoplasm",
          "Cell Organelles"
        ]
      },
      {
        "ch": "Tissues in Action",
        "topics": [
          "Plant Tissues",
          "Animal Tissues",
          "Structure and Function",
          "Tissue Organisation"
        ]
      },
      {
        "ch": "Describing Motion Around Us",
        "topics": [
          "Distance and Displacement",
          "Speed and Velocity",
          "Acceleration",
          "Motion Graphs"
        ]
      },
      {
        "ch": "Exploring Mixtures and their Separation",
        "topics": [
          "Types of Mixtures",
          "Solutions and Suspensions",
          "Separation Techniques",
          "Pure Substances"
        ]
      },
      {
        "ch": "How Forces Affect Motion",
        "topics": [
          "Balanced and Unbalanced Forces",
          "Laws of Motion",
          "Inertia",
          "Momentum"
        ]
      },
      {
        "ch": "Work, Energy, and Simple Machines",
        "topics": [
          "Work",
          "Energy",
          "Power",
          "Simple Machines"
        ]
      },
      {
        "ch": "Journey Inside the Atom",
        "topics": [
          "Subatomic Particles",
          "Atomic Models",
          "Atomic Number",
          "Electronic Configuration"
        ]
      },
      {
        "ch": "Atomic Foundations of Matter",
        "topics": [
          "Atoms and Molecules",
          "Chemical Formulae",
          "Mole Concept",
          "Mass Relationships"
        ]
      },
      {
        "ch": "Sound Waves: Characteristics and Applications",
        "topics": [
          "Production of Sound",
          "Sound Propagation",
          "Characteristics of Sound",
          "Applications of Sound"
        ]
      },
      {
        "ch": "Reproduction: How Life Continues",
        "topics": [
          "Asexual Reproduction",
          "Sexual Reproduction",
          "Reproduction in Plants",
          "Reproduction in Animals"
        ]
      },
      {
        "ch": "Patterns in Life: Diversity and Classification",
        "topics": [
          "Diversity of Organisms",
          "Classification",
          "Kingdoms of Life",
          "Adaptation and Evolutionary Links"
        ]
      },
      {
        "ch": "Earth as a System: Energy, Matter, and Life",
        "topics": [
          "Earth Systems",
          "Energy Flow",
          "Matter Cycles",
          "Life and Environment"
        ]
      }
    ],
    "Physics": [
      {
        "ch": "Describing Motion Around Us",
        "topics": [
          "Distance and Displacement",
          "Speed and Velocity",
          "Acceleration",
          "Distance-Time and Velocity-Time Graphs"
        ]
      },
      {
        "ch": "How Forces Affect Motion",
        "topics": [
          "Balanced and Unbalanced Forces",
          "Laws of Motion",
          "Inertia",
          "Conservation of Momentum"
        ]
      },
      {
        "ch": "Work, Energy, and Simple Machines",
        "topics": [
          "Work",
          "Kinetic and Potential Energy",
          "Conservation of Energy",
          "Power",
          "Simple Machines"
        ]
      },
      {
        "ch": "Sound Waves: Characteristics and Applications",
        "topics": [
          "Production and Propagation of Sound",
          "Characteristics of Sound Waves",
          "Speed of Sound",
          "Reflection of Sound",
          "Applications of Sound"
        ]
      }
    ],
    "Chemistry": [
      {
        "ch": "Exploring Mixtures and their Separation",
        "topics": [
          "Mixtures",
          "Solutions",
          "Suspension and Colloids",
          "Separation Techniques",
          "Pure Substances"
        ]
      },
      {
        "ch": "Journey Inside the Atom",
        "topics": [
          "Subatomic Particles",
          "Thomson's Model",
          "Rutherford's Model",
          "Bohr's Model",
          "Electronic Configuration"
        ]
      },
      {
        "ch": "Atomic Foundations of Matter",
        "topics": [
          "Atoms and Molecules",
          "Chemical Formulae",
          "Atomic and Molecular Mass",
          "Mole Concept",
          "Mass Relationships"
        ]
      }
    ],
    "Biology": [
      {
        "ch": "Cell: The Building Block of Life",
        "topics": [
          "Cell as Basic Unit",
          "Cell Membrane and Cell Wall",
          "Nucleus and Cytoplasm",
          "Cell Organelles"
        ]
      },
      {
        "ch": "Tissues in Action",
        "topics": [
          "Plant Tissues",
          "Animal Tissues",
          "Structure and Function",
          "Tissue Organisation"
        ]
      },
      {
        "ch": "Reproduction: How Life Continues",
        "topics": [
          "Asexual Reproduction",
          "Sexual Reproduction",
          "Reproduction in Plants",
          "Reproduction in Animals"
        ]
      },
      {
        "ch": "Patterns in Life: Diversity and Classification",
        "topics": [
          "Diversity of Organisms",
          "Classification",
          "Kingdoms of Life",
          "Adaptation and Evolutionary Links"
        ]
      },
      {
        "ch": "Earth as a System: Energy, Matter, and Life",
        "topics": [
          "Earth Systems",
          "Energy Flow",
          "Matter Cycles",
          "Life and Environment"
        ]
      }
    ],
    "History": [
      {
        "ch": "The French Revolution",
        "topics": [
          "French Society During Late 18th Century",
          "Outbreak of Revolution",
          "France Becomes a Constitutional Monarchy",
          "Abolition of Monarchy",
          "Rights of Women"
        ]
      },
      {
        "ch": "Socialism in Europe and the Russian Revolution",
        "topics": [
          "Age of Social Change",
          "Russian Revolution",
          "February and October Revolution",
          "Civil War"
        ]
      },
      {
        "ch": "Nazism and the Rise of Hitler",
        "topics": [
          "Birth of Weimar Republic",
          "Hitler's Rise to Power",
          "Nazi Worldview",
          "Youth in Nazi Germany"
        ]
      },
      {
        "ch": "Forest Society and Colonialism",
        "topics": [
          "Deforestation",
          "Rise of Commercial Forestry",
          "Rebellion in the Forest"
        ]
      },
      {
        "ch": "Pastoralists in the Modern World",
        "topics": [
          "Pastoral Nomads",
          "Colonial Rule and Pastoral Life",
          "Pastoralism in Africa"
        ]
      }
    ],
    "Geography": [
      {
        "ch": "India - Size and Location",
        "topics": [
          "Location",
          "Size",
          "India and the World",
          "India's Neighbours"
        ]
      },
      {
        "ch": "Physical Features of India",
        "topics": [
          "Theory of Plate Tectonics",
          "Himalayan Mountains",
          "Northern Plains",
          "Peninsular Plateau",
          "Indian Desert",
          "Coastal Plains",
          "Islands"
        ]
      },
      {
        "ch": "Drainage",
        "topics": [
          "Drainage Systems",
          "Himalayan Rivers",
          "Peninsular Rivers",
          "Lakes",
          "Role of Rivers"
        ]
      },
      {
        "ch": "Climate",
        "topics": [
          "Climate Controls",
          "Factors Affecting Climate",
          "Indian Monsoon",
          "Seasons",
          "Distribution of Rainfall"
        ]
      },
      {
        "ch": "Natural Vegetation and Wildlife",
        "topics": [
          "Types of Vegetation: Tropical Evergreen, Deciduous, Thorny, Montane, Mangrove",
          "Wildlife Conservation"
        ]
      },
      {
        "ch": "Population",
        "topics": [
          "Population Size and Distribution",
          "Population Growth",
          "Process of Population Change",
          "National Population Policy"
        ]
      }
    ],
    "Civics": [
      {
        "ch": "What is Democracy? Why Democracy?",
        "topics": [
          "Features of Democracy",
          "Arguments for and Against Democracy",
          "Broader Meaning of Democracy"
        ]
      },
      {
        "ch": "Constitutional Design",
        "topics": [
          "Democratic Constitution",
          "Making of Indian Constitution",
          "Guiding Values",
          "Preamble"
        ]
      },
      {
        "ch": "Electoral Politics",
        "topics": [
          "Why Elections?",
          "What is Our System?",
          "Political Competition",
          "Elections in India"
        ]
      },
      {
        "ch": "Working of Institutions",
        "topics": [
          "How Major Decisions are Taken",
          "Parliament",
          "Political Executive",
          "Judiciary"
        ]
      },
      {
        "ch": "Democratic Rights",
        "topics": [
          "Rights in a Democracy",
          "Fundamental Rights in the Indian Constitution",
          "Rights of Marginalized Groups"
        ]
      }
    ],
    "Economics": [
      {
        "ch": "The Story of Village Palampur",
        "topics": [
          "Organization of Production",
          "Farming in Palampur",
          "Non-farm Activities"
        ]
      },
      {
        "ch": "People as Resource",
        "topics": [
          "Economic Activities",
          "Quality of Population",
          "Unemployment"
        ]
      },
      {
        "ch": "Poverty as a Challenge",
        "topics": [
          "Two Typical Cases",
          "Poverty Estimates",
          "Vulnerable Groups",
          "Inter-state Disparities",
          "Anti-Poverty Measures"
        ]
      },
      {
        "ch": "Food Security in India",
        "topics": [
          "Food Security",
          "Buffer Stock",
          "Public Distribution System",
          "Role of Cooperatives"
        ]
      }
    ],
    "English": [
      {
        "ch": "Prose 1: The Fun They Had",
        "topics": [
          "Beehive - Isaac Asimov's story about future schools",
          "Education and technology"
        ]
      },
      {
        "ch": "Poem 1: The Road Not Taken",
        "topics": [
          "Beehive - Robert Frost's poem about choices and decisions"
        ]
      },
      {
        "ch": "Prose 2: The Sound of Music",
        "topics": [
          "Beehive - Evelyn Glennie's story",
          "Determination and achievement"
        ]
      },
      {
        "ch": "Poem 2: Wind",
        "topics": [
          "Beehive - Subramania Bharati's poem",
          "Challenges in life"
        ]
      },
      {
        "ch": "Prose 3: The Little Girl",
        "topics": [
          "Beehive - Katherine Mansfield's story about father-daughter relationship"
        ]
      },
      {
        "ch": "Poem 3: Rain on the Roof",
        "topics": [
          "Beehive - Coates Kinney's poem",
          "Memories and rain"
        ]
      },
      {
        "ch": "Prose 4: A Truly Beautiful Mind",
        "topics": [
          "Beehive - Albert Einstein's biography",
          "Genius and humanity"
        ]
      },
      {
        "ch": "Poem 4: The Lake Isle of Innisfree",
        "topics": [
          "Beehive - W.B. Yeats' poem",
          "Desire for peace"
        ]
      },
      {
        "ch": "Prose 5: The Snake and the Mirror",
        "topics": [
          "Beehive - Vaikom Muhammad Basheer's humorous story"
        ]
      },
      {
        "ch": "Poem 5: A Legend of the Northland",
        "topics": [
          "Beehive - Legend about St. Peter and a selfish woman"
        ]
      },
      {
        "ch": "Prose 6: My Childhood",
        "topics": [
          "Beehive - A.P.J. Abdul Kalam's autobiography"
        ]
      },
      {
        "ch": "Poem 6: No Men Are Foreign",
        "topics": [
          "Beehive - James Kirkup's poem",
          "Universal brotherhood"
        ]
      },
      {
        "ch": "Prose 7: Packing",
        "topics": [
          "Beehive - Jerome K. Jerome's humorous story"
        ]
      },
      {
        "ch": "Poem 7: The Duck and the Kangaroo",
        "topics": [
          "Beehive - Edward Lear's nonsense poem"
        ]
      },
      {
        "ch": "Prose 8: Reach for the Top",
        "topics": [
          "Beehive - Santosh Yadav and Maria Sharapova",
          "Success stories"
        ]
      },
      {
        "ch": "Prose 9: The Bond of Love",
        "topics": [
          "Beehive - Kenneth Anderson's story about human-animal bond"
        ]
      },
      {
        "ch": "Prose 10: Kathmandu",
        "topics": [
          "Beehive - Vikram Seth's travelogue",
          "Pashupatinath and Baudhnath"
        ]
      },
      {
        "ch": "Prose 11: If I Were You",
        "topics": [
          "Beehive - Douglas James' one-act play",
          "Wit and presence of mind"
        ]
      },
      {
        "ch": "Moments 1: The Lost Child",
        "topics": [
          "Mulk Raj Anand's story about a child lost in a fair"
        ]
      },
      {
        "ch": "Moments 2: The Adventures of Toto",
        "topics": [
          "Ruskin Bond's story about a monkey"
        ]
      },
      {
        "ch": "Moments 3: Iswaran the Storyteller",
        "topics": [
          "R.K. Laxman's story about a master storyteller"
        ]
      },
      {
        "ch": "Moments 4: In the Kingdom of Fools",
        "topics": [
          "Kannada folktale about a kingdom of fools"
        ]
      },
      {
        "ch": "Moments 5: The Happy Prince",
        "topics": [
          "Oscar Wilde's story about compassion and sacrifice"
        ]
      },
      {
        "ch": "Moments 6: Weathering the Storm in Ersama",
        "topics": [
          "Harsh Mander's account of the 1999 Odisha cyclone"
        ]
      },
      {
        "ch": "Moments 7: The Last Leaf",
        "topics": [
          "O. Henry's story about hope and sacrifice"
        ]
      },
      {
        "ch": "Moments 8: A House Is Not a Home",
        "topics": [
          "Zan Gaudioso's personal essay about loss and resilience"
        ]
      },
      {
        "ch": "Moments 9: The Accidental Tourist",
        "topics": [
          "Bill Bryson's humorous account of travel mishaps"
        ]
      },
      {
        "ch": "Moments 10: The Beggar",
        "topics": [
          "Anton Chekhov's story about transformation"
        ]
      }
    ],
    "Hindi": [
      {
        "ch": "दो बैलों की कथा",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 1 - कहानी (मोहन राकेश)"
        ]
      },
      {
        "ch": "ल्हासा की ओर",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 1 - यात्रा वृत्तांत (राहुल सांकृत्यायन)"
        ]
      },
      {
        "ch": "उपभोक्तावाद की संस्कृति",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 1 - निबंध (सत्येंद्र दुबे)"
        ]
      },
      {
        "ch": "सांवले सपनों की याद",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 1 - संस्मरण (यशपाल)"
        ]
      },
      {
        "ch": "नाना साहब की पुत्री देवी मैना",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 1 - कहानी (माथिलीशरण गुप्त)"
        ]
      },
      {
        "ch": "प्रेमचंद के फटे जूते",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 1 - निबंध (हरीशंकर परसाई)"
        ]
      },
      {
        "ch": "मेरे बचपन के दिन",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 1 - संस्मरण (मोहन राकेश)"
        ]
      },
      {
        "ch": "एक कुत्ता और एक मैना",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 1 - कहानी (सेतु माधव राव पगडी)"
        ]
      },
      {
        "ch": "साखियाँ एवं सबद (कबीर)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 1 - दोहे और साखियाँ"
        ]
      },
      {
        "ch": "वाख (लाल देद)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 1 - कश्मीरी कविता"
        ]
      },
      {
        "ch": "सवैये (रहीम)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 1 - सवैये"
        ]
      },
      {
        "ch": "कैदी और कोकिला (मैथिलीशरण गुप्त)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 1 - कविता"
        ]
      },
      {
        "ch": "ग्राम श्री (सुमित्रानंदन पंत)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 1 - कविता"
        ]
      },
      {
        "ch": "चंद्र गहना से लौटती बेर (महादेवी वर्मा)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 1 - कविता"
        ]
      },
      {
        "ch": "मेघ आए (सूर्यकांत त्रिपाठी निराला)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 1 - कविता"
        ]
      },
      {
        "ch": "यमराज की दिशा (रामधारी सिंह दिनकर)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 1 - कविता"
        ]
      },
      {
        "ch": "बछेन्द्री पाल (पुष्पा भारती)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 1 - जीवनी"
        ]
      },
      {
        "ch": "व्याकरण: पद परिचय, संज्ञा, सर्वनाम",
        "topics": [
          "व्याकरण अध्याय"
        ]
      },
      {
        "ch": "व्याकरण: क्रिया, विशेषण, अव्यय",
        "topics": [
          "व्याकरण अध्याय"
        ]
      },
      {
        "ch": "व्याकरण: वाच्य, पद परिचय, अलंकार",
        "topics": [
          "व्याकरण अध्याय"
        ]
      }
    ],
    "Basic Computer": [
      {
        "ch": "Basics of Python",
        "topics": [
          "Introduction to Python",
          "Variables",
          "Data Types (int, float, str, bool)",
          "Operators",
          "Input/Output",
          "Comments"
        ]
      },
      {
        "ch": "Conditional Statements",
        "topics": [
          "if, if-else, if-elif-else",
          "Nested Conditions",
          "Practical Examples"
        ]
      },
      {
        "ch": "Loops",
        "topics": [
          "for loop",
          "while loop",
          "Nested Loops",
          "break and continue",
          "Loop else"
        ]
      },
      {
        "ch": "Strings",
        "topics": [
          "String Operations",
          "Slicing",
          "String Methods",
          "Formatting",
          "Pattern Programs"
        ]
      },
      {
        "ch": "Lists",
        "topics": [
          "Creating Lists",
          "Indexing and Slicing",
          "List Methods",
          "Nested Lists",
          "List Comprehension"
        ]
      },
      {
        "ch": "Tuples and Dictionaries",
        "topics": [
          "Tuple Operations",
          "Dictionary Creation",
          "Methods",
          "Nested Dictionary"
        ]
      },
      {
        "ch": "Functions",
        "topics": [
          "Defining Functions",
          "Parameters and Arguments",
          "Return Statement",
          "Types of Functions",
          "Scope of Variables"
        ]
      },
      {
        "ch": "File Handling",
        "topics": [
          "Opening and Closing Files",
          "Reading and Writing",
          "File Modes",
          "tell() and seek()"
        ]
      },
      {
        "ch": "Introduction to SQL",
        "topics": [
          "Database Concepts",
          "CREATE, INSERT, SELECT, UPDATE, DELETE",
          "WHERE clause",
          "ORDER BY",
          "Aggregate Functions"
        ]
      },
      {
        "ch": "Computer Systems and Organisation",
        "topics": [
          "Basic Computer Organisation",
          "Boolean Logic",
          "Number Representation",
          "Types of Software",
          "Computer organisation: CPU, memory, I/O",
          "Types of software",
          "Boolean logic and truth tables",
          "Number systems (binary, octal, hex)",
          "Encoding schemes (ASCII, UTF-8)",
          "Cloud computing basics"
        ]
      },
      {
        "ch": "Cyber Safety",
        "topics": [
          "Safely Browsing Web",
          "Identity Protection",
          "Confidentiality",
          "Cyber Trolls and Bullying",
          "Malware Protection"
        ]
      },
      {
        "ch": "Python Programming Fundamentals",
        "topics": [
          "Python installation and IDE",
          "Variables and data types",
          "Operators",
          "Input and output",
          "Conditional statements",
          "Nested conditions",
          "String manipulation",
          "String methods"
        ]
      },
      {
        "ch": "Python - Loops and Lists",
        "topics": [
          "for and while loops",
          "Nested loops",
          "break, continue, pass",
          "List operations",
          "Indexing and slicing",
          "List methods",
          "List comprehension basics",
          "Tuple basics"
        ]
      },
      {
        "ch": "Python - Dictionaries and Functions",
        "topics": [
          "Dictionary creation and operations",
          "Dictionary methods",
          "Nested dictionary",
          "Function definition",
          "Parameters and arguments",
          "Return statement",
          "Scope of variables",
          "Types of functions",
          "Lambda functions"
        ]
      },
      {
        "ch": "Database Management - SQL",
        "topics": [
          "Database concepts",
          "MySQL installation",
          "Data types",
          "CREATE, INSERT, SELECT, UPDATE, DELETE",
          "WHERE, ORDER BY, GROUP BY",
          "Aggregate functions",
          "JOINs",
          "Python-MySQL connectivity"
        ]
      },
      {
        "ch": "Cyber Safety and Ethics",
        "topics": [
          "Safely browsing web",
          "Identity protection",
          "Confidentiality",
          "Social networks and cyber trolls",
          "Malware (virus, adware, Trojan)",
          "Secure connections",
          "Phishing",
          "Appropriate usage of social media"
        ]
      }
    ],
    "Advanced Computer": [
      {
        "ch": "Communication Skills - IT",
        "topics": [
          "Professional Communication",
          "Reading and Writing Skills",
          "Verbal Communication",
          "Non-verbal Cues"
        ]
      },
      {
        "ch": "Self-Management Skills",
        "topics": [
          "Time Management",
          "Goal Setting",
          "Stress Management",
          "Personal Grooming"
        ]
      },
      {
        "ch": "Basic ICT Skills",
        "topics": [
          "Operating System Use",
          "File Management",
          "Internet Basics",
          "Digital Communication Tools"
        ]
      },
      {
        "ch": "Entrepreneurial Skills",
        "topics": [
          "Entrepreneurship Concepts",
          "Business Opportunities",
          "Planning a Business",
          "Risk and Reward"
        ]
      },
      {
        "ch": "Green Skills",
        "topics": [
          "Environment Awareness",
          "Sustainable Practices",
          "Energy Conservation",
          "Green Careers"
        ]
      },
      {
        "ch": "Word Processing - Advanced",
        "topics": [
          "Templates",
          "Mail Merge",
          "Macros",
          "Collaborative Features"
        ]
      },
      {
        "ch": "Digital Spreadsheets",
        "topics": [
          "Advanced Formulas",
          "Conditional Formatting",
          "Data Analysis",
          "Pivot Tables - Introduction"
        ]
      }
    ]
  },
  "10": {
    "Mathematics": [
      {
        "ch": "Real Numbers",
        "topics": [
          "Euclid's Division Lemma",
          "Fundamental Theorem of Arithmetic",
          "Irrational Numbers",
          "Rational Numbers and Decimal Expansions"
        ]
      },
      {
        "ch": "Polynomials",
        "topics": [
          "Zeroes of Polynomials",
          "Relationship between Zeroes and Coefficients",
          "Division Algorithm"
        ]
      },
      {
        "ch": "Pair of Linear Equations in Two Variables",
        "topics": [
          "Graphical Method",
          "Algebraic Methods: Substitution, Elimination, Cross-Multiplication",
          "Equations Reducible to Linear"
        ]
      },
      {
        "ch": "Quadratic Equations",
        "topics": [
          "Solution by Factorisation",
          "Completing the Square",
          "Quadratic Formula",
          "Nature of Roots"
        ]
      },
      {
        "ch": "Arithmetic Progressions",
        "topics": [
          "Introduction",
          "nth Term",
          "Sum of First n Terms",
          "Applications"
        ]
      },
      {
        "ch": "Triangles",
        "topics": [
          "Similar Figures",
          "Similarity of Triangles",
          "Criteria for Similarity",
          "Areas of Similar Triangles",
          "Pythagoras Theorem"
        ]
      },
      {
        "ch": "Coordinate Geometry",
        "topics": [
          "Distance Formula",
          "Section Formula",
          "Area of Triangle"
        ]
      },
      {
        "ch": "Introduction to Trigonometry",
        "topics": [
          "Trigonometric Ratios",
          "Trigonometric Ratios of Specific Angles",
          "Complementary Angles",
          "Trigonometric Identities"
        ]
      },
      {
        "ch": "Applications of Trigonometry",
        "topics": [
          "Heights and Distances",
          "Angle of Elevation and Depression"
        ]
      },
      {
        "ch": "Circles",
        "topics": [
          "Tangent to a Circle",
          "Number of Tangents from a Point on a Circle"
        ]
      },
      {
        "ch": "Constructions",
        "topics": [
          "Division of Line Segment",
          "Construction of Tangents to a Circle"
        ]
      },
      {
        "ch": "Areas Related to Circles",
        "topics": [
          "Perimeter and Area of Circle",
          "Areas of Sector and Segment",
          "Combinations of Plane Figures"
        ]
      },
      {
        "ch": "Surface Areas and Volumes",
        "topics": [
          "Surface Area of Combination of Solids",
          "Volume of Combination",
          "Conversion of Solid from One Shape to Another",
          "Frustum of a Cone"
        ]
      },
      {
        "ch": "Statistics",
        "topics": [
          "Mean of Grouped Data",
          "Mode",
          "Median",
          "Graphical Representation: Ogive"
        ]
      },
      {
        "ch": "Probability",
        "topics": [
          "Theoretical Approach to Probability"
        ]
      }
    ],
    "Science": [
      {
        "ch": "Chemical Reactions and Equations",
        "topics": [
          "Chemical Equations",
          "Balanced Chemical Equations",
          "Types of Chemical Reactions",
          "Oxidation and Reduction"
        ]
      },
      {
        "ch": "Acids, Bases and Salts",
        "topics": [
          "Indicators",
          "Acids and Bases",
          "pH Scale",
          "Salts and Common Salt"
        ]
      },
      {
        "ch": "Metals and Non-metals",
        "topics": [
          "Physical Properties",
          "Chemical Properties",
          "Reactivity Series",
          "Ionic Compounds",
          "Metallurgy"
        ]
      },
      {
        "ch": "Carbon and its Compounds",
        "topics": [
          "Covalent Bonding",
          "Versatile Nature of Carbon",
          "Homologous Series",
          "Ethanol and Ethanoic Acid",
          "Soaps and Detergents"
        ]
      },
      {
        "ch": "Life Processes",
        "topics": [
          "Nutrition",
          "Respiration",
          "Transportation",
          "Excretion"
        ]
      },
      {
        "ch": "Control and Coordination",
        "topics": [
          "Nervous System",
          "Reflex Action",
          "Human Brain",
          "Plant Hormones"
        ]
      },
      {
        "ch": "How do Organisms Reproduce?",
        "topics": [
          "Asexual Reproduction",
          "Sexual Reproduction",
          "Reproduction in Plants",
          "Reproductive Health"
        ]
      },
      {
        "ch": "Heredity",
        "topics": [
          "Variation",
          "Mendel's Laws",
          "Sex Determination",
          "Inherited Traits"
        ]
      },
      {
        "ch": "Light - Reflection and Refraction",
        "topics": [
          "Reflection",
          "Spherical Mirrors",
          "Refraction",
          "Lenses",
          "Power of Lens"
        ]
      },
      {
        "ch": "The Human Eye and the Colourful World",
        "topics": [
          "Human Eye",
          "Defects of Vision",
          "Prism and Dispersion",
          "Atmospheric Refraction",
          "Scattering of Light"
        ]
      },
      {
        "ch": "Electricity",
        "topics": [
          "Electric Current",
          "Potential Difference",
          "Ohm's Law",
          "Resistance",
          "Heating Effect",
          "Electric Power"
        ]
      },
      {
        "ch": "Magnetic Effects of Electric Current",
        "topics": [
          "Magnetic Field",
          "Force on Current-Carrying Conductor",
          "Electric Motor",
          "Electromagnetic Induction",
          "Domestic Electric Circuits"
        ]
      },
      {
        "ch": "Our Environment",
        "topics": [
          "Ecosystem",
          "Food Chains and Webs",
          "Ozone Layer",
          "Waste Management"
        ]
      }
    ],
    "Physics": [
      {
        "ch": "Light - Reflection and Refraction",
        "topics": [
          "Reflection of Light",
          "Spherical Mirrors",
          "Mirror Formula and Magnification",
          "Refraction",
          "Laws of Refraction",
          "Refractive Index",
          "Lens Formula and Magnification",
          "Power of Lens"
        ]
      },
      {
        "ch": "The Human Eye and the Colourful World",
        "topics": [
          "Human Eye",
          "Defects of Vision and Correction",
          "Refraction of Light Through a Prism",
          "Dispersion",
          "Atmospheric Refraction",
          "Scattering of Light"
        ]
      },
      {
        "ch": "Electricity",
        "topics": [
          "Electric Current and Circuit",
          "Electric Potential and Potential Difference",
          "Ohm's Law",
          "Resistance",
          "Resistivity",
          "Combination of Resistors",
          "Heating Effect",
          "Electric Power"
        ]
      },
      {
        "ch": "Magnetic Effects of Electric Current",
        "topics": [
          "Magnetic Field and Field Lines",
          "Magnetic Field due to Current Carrying Conductor",
          "Fleming's Left-Hand Rule",
          "Electric Motor",
          "Electromagnetic Induction",
          "Electric Generator",
          "Domestic Electric Circuits"
        ]
      }
    ],
    "Chemistry": [
      {
        "ch": "Chemical Reactions and Equations",
        "topics": [
          "Chemical Equations",
          "Balanced Chemical Equations",
          "Types: Combination, Decomposition, Displacement, Double Displacement",
          "Oxidation and Reduction",
          "Redox Reactions"
        ]
      },
      {
        "ch": "Acids, Bases and Salts",
        "topics": [
          "Acids and Bases in Laboratory",
          "Indicators",
          "pH Scale",
          "Importance of pH",
          "Salts",
          "Family of Salts",
          "Chemicals from Common Salt"
        ]
      },
      {
        "ch": "Metals and Non-metals",
        "topics": [
          "Physical Properties",
          "Chemical Properties of Metals",
          "Reactions with Air, Water, Acids",
          "Displacement Reactions",
          "Reactivity Series",
          "Properties of Non-metals",
          "Ionic Compounds",
          "Metallurgy"
        ]
      },
      {
        "ch": "Carbon and its Compounds",
        "topics": [
          "Bonding in Carbon",
          "Versatile Nature of Carbon",
          "Saturated and Unsaturated Compounds",
          "Chains, Branches, Rings",
          "Homologous Series",
          "Nomenclature",
          "Chemical Properties",
          "Ethanol and Ethanoic Acid",
          "Soaps and Detergents"
        ]
      }
    ],
    "Biology": [
      {
        "ch": "Life Processes",
        "topics": [
          "Nutrition: Autotrophic and Heterotrophic",
          "Respiration",
          "Transportation in Plants and Animals",
          "Excretion",
          "Human Excretory System"
        ]
      },
      {
        "ch": "Control and Coordination",
        "topics": [
          "Animals: Nervous System",
          "Reflex Action",
          "Human Brain",
          "Coordination in Plants",
          "Plant Hormones"
        ]
      },
      {
        "ch": "How Do Organisms Reproduce?",
        "topics": [
          "Modes of Reproduction: Asexual and Sexual",
          "Reproduction in Plants and Animals",
          "Reproductive Health"
        ]
      },
      {
        "ch": "Heredity",
        "topics": [
          "Variations",
          "Mendel's Laws",
          "Sex Determination",
          "Inherited Traits"
        ]
      },
      {
        "ch": "Our Environment",
        "topics": [
          "Ecosystem and Its Components",
          "Food Chains and Webs",
          "Ozone Layer Depletion",
          "Managing Garbage"
        ]
      }
    ],
    "History": [
      {
        "ch": "The Rise of Nationalism in Europe",
        "topics": [
          "French Revolution and Nationalism",
          "Napoleonic Code",
          "Making of Germany and Italy",
          "Visualising the Nation",
          "Nationalism and Imperialism"
        ]
      },
      {
        "ch": "Nationalism in India",
        "topics": [
          "First World War and Nationalist Response",
          "Rowlatt Act",
          "Non-Cooperation Movement",
          "Civil Disobedience",
          "Quit India",
          "Towards Independence"
        ]
      },
      {
        "ch": "The Making of a Global World",
        "topics": [
          "Pre-modern World",
          "Nineteenth Century",
          "Inter-war Economy",
          "Post-war Era",
          "Bretton Woods"
        ]
      },
      {
        "ch": "The Age of Industrialisation",
        "topics": [
          "Before Industrial Revolution",
          "Industrialisation in Britain",
          "Industrialisation in India",
          "Factories and Workers"
        ]
      },
      {
        "ch": "Print Culture and the Modern World",
        "topics": [
          "First Printed Books",
          "Print Comes to Europe",
          "Print and Dissent",
          "India and the World of Print",
          "Religious Reform and Public Debates",
          "Print and Censorship"
        ]
      }
    ],
    "Geography": [
      {
        "ch": "Resources and Development",
        "topics": [
          "Types of Resources",
          "Resource Planning in India",
          "Land Resources",
          "Land Use Pattern",
          "Land Degradation and Conservation"
        ]
      },
      {
        "ch": "Forest and Wildlife Resources",
        "topics": [
          "Biodiversity and Its Depletion",
          "Conservation",
          "Community and Conservation"
        ]
      },
      {
        "ch": "Water Resources",
        "topics": [
          "Water Scarcity",
          "Multi-purpose River Projects",
          "Rainwater Harvesting",
          "Integrated Water Resources Management"
        ]
      },
      {
        "ch": "Agriculture",
        "topics": [
          "Types of Farming",
          "Cropping Pattern",
          "Major Crops",
          "Food Security",
          "Impact of Globalisation"
        ]
      },
      {
        "ch": "Minerals and Energy Resources",
        "topics": [
          "Classification of Minerals",
          "Occurrence",
          "Conservation",
          "Conventional and Non-conventional Energy Resources"
        ]
      },
      {
        "ch": "Manufacturing Industries",
        "topics": [
          "Importance",
          "Classification",
          "Agro-based and Mineral-based Industries",
          "Industrial Pollution",
          "Environmental Degradation"
        ]
      },
      {
        "ch": "Lifelines of National Economy",
        "topics": [
          "Transport: Roadways, Railways, Pipelines, Waterways, Airways",
          "Communication",
          "International Trade",
          "Tourism"
        ]
      }
    ],
    "Civics": [
      {
        "ch": "Power Sharing",
        "topics": [
          "Case Studies: Belgium and Sri Lanka",
          "Forms of Power Sharing"
        ]
      },
      {
        "ch": "Federalism",
        "topics": [
          "What is Federalism",
          "Indian Federalism",
          "How is Federalism Practised",
          "Decentralisation in India"
        ]
      },
      {
        "ch": "Democracy and Diversity",
        "topics": [
          "Democracy and Diversity: Mexico and US",
          "Caste Inequalities",
          "Gender and Religion"
        ]
      },
      {
        "ch": "Gender, Religion and Caste",
        "topics": [
          "Gender and Politics",
          "Women's Political Representation",
          "Religion, Communalism and Politics",
          "Caste and Politics"
        ]
      },
      {
        "ch": "Popular Struggles and Movements",
        "topics": [
          "Movement for Democracy in Nepal",
          "Bolivian Water War",
          "Pressure Groups and Movements"
        ]
      },
      {
        "ch": "Political Parties",
        "topics": [
          "Why Political Parties",
          "How Many Parties Should Exist",
          "National and Regional Parties",
          "Challenges to Political Parties",
          "Reforms"
        ]
      },
      {
        "ch": "Outcomes of Democracy",
        "topics": [
          "Assessment of Democracy's Outcomes",
          "Accountable, Responsive and Legitimate Government",
          "Economic Growth and Development",
          "Reduction of Inequality and Poverty",
          "Accommodation of Social Diversity",
          "Dignity and Freedom of Citizens"
        ]
      },
      {
        "ch": "Challenges to Democracy",
        "topics": [
          "Thinking About Challenges",
          "Different Contexts, Different Challenges",
          "Political Reforms",
          "Redefining Democracy"
        ]
      }
    ],
    "Economics": [
      {
        "ch": "Development",
        "topics": [
          "What Development Promises",
          "Different People, Different Goals",
          "Income and Other Goals",
          "National Development",
          "Comparison of Countries",
          "Income and Other Criteria",
          "Public Facilities",
          "Sustainability of Development"
        ]
      },
      {
        "ch": "Sectors of the Indian Economy",
        "topics": [
          "Sectors of Economic Activities",
          "Comparing Three Sectors",
          "Primary, Secondary and Tertiary Sectors",
          "Division of Sectors",
          "Sectors in India",
          "Employment Generation"
        ]
      },
      {
        "ch": "Money and Credit",
        "topics": [
          "Barter System",
          "Modern Forms of Money",
          "Loan Activities of Banks",
          "Terms of Credit",
          "Formal Sector Credit in India",
          "Self Help Groups"
        ]
      },
      {
        "ch": "Globalisation and the Indian Economy",
        "topics": [
          "Production Across Countries",
          "Interlinking Production",
          "Foreign Trade",
          "World Trade Organisation",
          "Impact of Globalisation",
          "Fair Globalisation"
        ]
      },
      {
        "ch": "Consumer Rights",
        "topics": [
          "Consumer in Market Place",
          "Consumer Movement",
          "Consumer Rights: Safety, Information, Choice, Redressal, Education",
          "Taking the Movement Forward"
        ]
      }
    ],
    "English": [
      {
        "ch": "Prose 1: A Letter to God",
        "topics": [
          "First Flight - G.L. Fuentes' story about faith and humanity"
        ]
      },
      {
        "ch": "Poem 1: Dust of Snow",
        "topics": [
          "First Flight - Robert Frost's poem",
          "Small things change mood"
        ]
      },
      {
        "ch": "Poem 2: Fire and Ice",
        "topics": [
          "First Flight - Robert Frost's poem about destruction"
        ]
      },
      {
        "ch": "Prose 2: Nelson Mandela: Long Walk to Freedom",
        "topics": [
          "First Flight - Mandela's autobiography",
          "Freedom and equality"
        ]
      },
      {
        "ch": "Poem 3: A Tiger in the Zoo",
        "topics": [
          "First Flight - Leslie Norris' poem about captivity"
        ]
      },
      {
        "ch": "Prose 3: Two Stories About Flying",
        "topics": [
          "First Flight - I. His First Flight (Liam O'Flaherty)",
          "II. Black Aeroplane (Frederick Forsyth)"
        ]
      },
      {
        "ch": "Poem 4: How to Tell Wild Animals",
        "topics": [
          "First Flight - Carolyn Wells' humorous poem"
        ]
      },
      {
        "ch": "Poem 5: The Ball Poem",
        "topics": [
          "First Flight - John Berryman's poem about loss"
        ]
      },
      {
        "ch": "Prose 4: From the Diary of Anne Frank",
        "topics": [
          "First Flight - Anne Frank's diary",
          "Adolescence and confinement"
        ]
      },
      {
        "ch": "Poem 6: Amanda!",
        "topics": [
          "First Flight - Robin Klein's poem about freedom"
        ]
      },
      {
        "ch": "Prose 5: The Hundred Dresses - I",
        "topics": [
          "First Flight - Eleanor Estes' story about bullying"
        ]
      },
      {
        "ch": "Prose 6: The Hundred Dresses - II",
        "topics": [
          "First Flight - Conclusion of the story",
          "Empathy"
        ]
      },
      {
        "ch": "Poem 7: Animals",
        "topics": [
          "First Flight - Walt Whitman's poem",
          "Human flaws"
        ]
      },
      {
        "ch": "Prose 7: Glimpses of India",
        "topics": [
          "First Flight - I. A Baker from Goa",
          "II. Coorg",
          "III. Tea from Assam"
        ]
      },
      {
        "ch": "Poem 8: The Trees",
        "topics": [
          "First Flight - Adrienne Rich's poem about freedom"
        ]
      },
      {
        "ch": "Prose 8: Mijbil the Otter",
        "topics": [
          "First Flight - Gavin Maxwell's story about pet otter"
        ]
      },
      {
        "ch": "Poem 9: Fog",
        "topics": [
          "First Flight - Carl Sandburg's poem",
          "Nature imagery"
        ]
      },
      {
        "ch": "Prose 9: Madam Rides the Bus",
        "topics": [
          "First Flight - Vallikkannan's story about adventure"
        ]
      },
      {
        "ch": "Poem 10: The Tale of Custard the Dragon",
        "topics": [
          "First Flight - Ogden Nash's humorous poem"
        ]
      },
      {
        "ch": "Prose 10: The Sermon at Benares",
        "topics": [
          "First Flight - Buddhism",
          "Buddha's first sermon"
        ]
      },
      {
        "ch": "Prose 11: The Proposal",
        "topics": [
          "First Flight - Anton Chekhov's one-act comedy"
        ]
      },
      {
        "ch": "Footprints 1: A Triumph of Surgery",
        "topics": [
          "James Herriot's story about pet care"
        ]
      },
      {
        "ch": "Footprints 2: The Thief's Story",
        "topics": [
          "Ruskin Bond's story about trust and redemption"
        ]
      },
      {
        "ch": "Footprints 3: The Midnight Visitor",
        "topics": [
          "Robert Arthur's detective story"
        ]
      },
      {
        "ch": "Footprints 4: A Question of Trust",
        "topics": [
          "Victor Canning's story about irony"
        ]
      },
      {
        "ch": "Footprints 5: Footprints without Feet",
        "topics": [
          "H.G. Wells' science fiction story"
        ]
      },
      {
        "ch": "Footprints 6: The Making of a Scientist",
        "topics": [
          "Richard Brightwell's biography of Richard Ebright"
        ]
      },
      {
        "ch": "Footprints 7: The Necklace",
        "topics": [
          "Guy de Maupassant's story about greed"
        ]
      },
      {
        "ch": "Footprints 8: The Hack Driver",
        "topics": [
          "Sinclair Lewis' humorous story"
        ]
      },
      {
        "ch": "Footprints 9: Bholi",
        "topics": [
          "K.A. Abbas' story about empowerment"
        ]
      },
      {
        "ch": "Footprints 10: The Book That Saved the Earth",
        "topics": [
          "Claire Boiko's science fiction play"
        ]
      }
    ],
    "Hindi": [
      {
        "ch": "सखी (मैथिलीशरण गुप्त)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 2 - कविता"
        ]
      },
      {
        "ch": "तुम कब जाओगे अतिथि (दुष्यंत कुमार)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 2 - कविता"
        ]
      },
      {
        "ch": "पद (मीराबाई)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 2 - पद"
        ]
      },
      {
        "ch": "दोहे (रहीम)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 2 - दोहे"
        ]
      },
      {
        "ch": "मनुष्यता (मैथिलीशरण गुप्त)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 2 - कविता"
        ]
      },
      {
        "ch": "मधुर-मधुर मेरे दीपक जल (सुमित्रानंदन पंत)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 2 - कविता"
        ]
      },
      {
        "ch": "यमराज की दिशा (रामधारी सिंह दिनकर)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 2 - कविता"
        ]
      },
      {
        "ch": "बड़े भाई साहब (प्रेमचंद)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 2 - कहानी"
        ]
      },
      {
        "ch": "डायरी का एक पन्ना (अनंत पांडेय)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 2 - डायरी"
        ]
      },
      {
        "ch": "तताँर-वताँर (हजारी प्रसाद द्विवेदी)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 2 - संस्मरण"
        ]
      },
      {
        "ch": "तीसरी कसम के शिल्पकार 'शैलेंद्र' (प्रियंकर श्रीधर)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 2 - जीवनी"
        ]
      },
      {
        "ch": "अब कहाँ दूसरे के दुख से दुखी होने वाले (केशव प्रसाद मिश्र)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 2 - कहानी"
        ]
      },
      {
        "ch": "पतझड़ में टूटी पत्तियाँ (गिरिराज किशोर)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 2 - कहानी"
        ]
      },
      {
        "ch": "कारतूस (हबीब तनवीर)",
        "topics": [
          "पाठ्यपुस्तक: क्षितिज भाग 2 - एकांकी"
        ]
      },
      {
        "ch": "व्याकरण: पद प्रक्रिया, पर्यायवाची, विलोम",
        "topics": [
          "व्याकरण अध्याय"
        ]
      },
      {
        "ch": "व्याकरण: मुहावरे, अलंकार, समास",
        "topics": [
          "व्याकरण अध्याय"
        ]
      }
    ],
    "Basic Computer": [
      {
        "ch": "Revision of Python Basics",
        "topics": [
          "Variables, Data Types, Operators, Input/Output, Conditional Statements, Loops, Strings, Lists, Tuples, Dictionaries"
        ]
      },
      {
        "ch": "Functions in Python",
        "topics": [
          "Built-in Functions",
          "User-defined Functions",
          "Arguments and Parameters",
          "Default Parameters",
          "Scope of Variables",
          "Lambda Functions"
        ]
      },
      {
        "ch": "File Handling",
        "topics": [
          "Text Files: open, read, write, close",
          "Binary Files",
          "CSV Files",
          "pickle Module",
          "seek() and tell()"
        ]
      },
      {
        "ch": "Data Structures",
        "topics": [
          "Stack: Push and Pop Operations",
          "Implementation using List",
          "Queue",
          "Applications"
        ]
      },
      {
        "ch": "Computer Networks",
        "topics": [
          "Types of Networks",
          "Network Devices",
          "Network Protocols",
          "Introduction to Internet",
          "Network Security",
          "Types of networks: LAN, WAN, MAN",
          "Network topologies",
          "Network devices: router, switch, hub, modem",
          "Network protocols: TCP/IP, HTTP, FTP",
          "Network security basics",
          "Cloud computing",
          "IoT introduction"
        ]
      },
      {
        "ch": "Database Management",
        "topics": [
          "Concepts of DBMS",
          "SQL Commands: CREATE, INSERT, SELECT, UPDATE, DELETE",
          "Python-MySQL Connectivity",
          "Project Work"
        ]
      },
      {
        "ch": "Cyber Ethics and Safety",
        "topics": [
          "Netiquette",
          "Digital Footprint",
          "Cyber Crimes",
          "Copyright and Plagiarism",
          "Safe Online Practices"
        ]
      },
      {
        "ch": "Emerging Technologies",
        "topics": [
          "AI, Machine Learning, IoT, Cloud Computing, Blockchain, Big Data Analytics"
        ]
      },
      {
        "ch": "Python - Advanced Programming",
        "topics": [
          "Revision of Class 9",
          "Functions: built-in, user-defined, module functions",
          "Default and positional parameters",
          "Returning multiple values",
          "Flow of execution",
          "Scope: global and local",
          "Recursion basics"
        ]
      },
      {
        "ch": "Python - File Handling and Data Structures",
        "topics": [
          "Text files: open, read, write, close, with statement",
          "seek() and tell()",
          "Binary files: pickle module (dump, load)",
          "CSV files: csv module",
          "Stack implementation using list",
          "Queue basics"
        ]
      },
      {
        "ch": "Python - Exception Handling and OOP Basics",
        "topics": [
          "try-except-finally blocks",
          "Raising exceptions",
          "Built-in exceptions",
          "Introduction to OOP: classes, objects, constructor",
          "Inheritance basics",
          "Polymorphism concept"
        ]
      },
      {
        "ch": "Database Management and Python-MySQL",
        "topics": [
          "MySQL advanced: DISTINCT, LIKE, IN, BETWEEN",
          "ALTER TABLE, DROP",
          "Constraints: PRIMARY KEY, FOREIGN KEY, NOT NULL",
          "Joins: INNER, LEFT, RIGHT",
          "Python-MySQL connectivity using mysql-connector",
          "CRUD operations via Python"
        ]
      },
      {
        "ch": "Society, Law and Ethics in Computing",
        "topics": [
          "Cyber ethics",
          "Intellectual property rights",
          "Copyright and patents",
          "Privacy laws",
          "Digital footprint and identity",
          "Cyber crimes: hacking, phishing, identity theft",
          "E-waste management",
          "Career awareness in IT"
        ]
      },
      {
        "ch": "Data Science Basics (Optional)",
        "topics": [
          "What is data science?",
          "Data collection and cleaning",
          "Basic statistics",
          "Data visualization with Python (matplotlib)",
          "Introduction to pandas",
          "Simple data analysis project"
        ]
      }
    ],
    "Advanced Computer": [
      {
        "ch": "Mobile App Development Concepts (Optional)",
        "topics": [
          "Introduction to app development",
          "MIT App Inventor basics",
          "UI design",
          "Event handling",
          "Building simple apps",
          "App deployment concepts"
        ]
      }
    ]
  },
  "11": {
    "Mathematics": [
      {
        "ch": "Unit I - Ch 1: Sets",
        "topics": [
          "Sets and Their Representations",
          "Empty Set",
          "Finite and Infinite Sets",
          "Equal Sets",
          "Subsets",
          "Power Set",
          "Universal Set",
          "Venn Diagrams",
          "Union, Intersection, Complement",
          "Practical Problems"
        ]
      },
      {
        "ch": "Unit I - Ch 2: Relations and Functions",
        "topics": [
          "Cartesian Product of Sets",
          "Relations",
          "Functions",
          "Domain, Range",
          "Algebra of Real Functions"
        ]
      },
      {
        "ch": "Unit I - Ch 3: Trigonometric Functions",
        "topics": [
          "Angles",
          "Trigonometric Functions",
          "Sum and Difference of Two Angles",
          "Trigonometric Equations"
        ]
      },
      {
        "ch": "Unit II - Ch 4: Complex Numbers and Quadratic Equations",
        "topics": [
          "Complex Numbers",
          "Algebra",
          "Modulus",
          "Argand Plane",
          "Quadratic Equations"
        ]
      },
      {
        "ch": "Unit II - Ch 5: Linear Inequalities",
        "topics": [
          "Algebraic Solutions",
          "Graphical Representation",
          "System of Linear Inequalities"
        ]
      },
      {
        "ch": "Unit II - Ch 6: Permutations and Combinations",
        "topics": [
          "Fundamental Principle of Counting",
          "Factorial",
          "Permutations",
          "Combinations"
        ]
      },
      {
        "ch": "Unit II - Ch 7: Binomial Theorem",
        "topics": [
          "Binomial Theorem for Positive Integral Indices",
          "General and Middle Terms"
        ]
      },
      {
        "ch": "Unit II - Ch 8: Sequences and Series",
        "topics": [
          "Sequences",
          "Series",
          "Arithmetic Progression",
          "Geometric Progression",
          "Relationship between AM and GM",
          "Sum to n Terms of Special Series"
        ]
      },
      {
        "ch": "Unit III - Ch 9: Straight Lines",
        "topics": [
          "Slope of a Line",
          "Various Forms of Equation",
          "General Equation",
          "Distance of a Point from a Line"
        ]
      },
      {
        "ch": "Unit III - Ch 10: Conic Sections",
        "topics": [
          "Circle",
          "Parabola",
          "Ellipse",
          "Hyperbola",
          "Standard Equations and Properties"
        ]
      },
      {
        "ch": "Unit III - Ch 11: Introduction to Three Dimensional Geometry",
        "topics": [
          "Coordinate Axes and Planes",
          "Coordinates of a Point",
          "Distance between Two Points",
          "Section Formula"
        ]
      },
      {
        "ch": "Unit IV - Ch 12: Limits and Derivatives",
        "topics": [
          "Intuitive Idea",
          "Limits",
          "Limits of Trigonometric Functions",
          "Derivatives",
          "Algebra of Derivatives"
        ]
      },
      {
        "ch": "Unit V - Ch 13: Statistics",
        "topics": [
          "Measures of Dispersion",
          "Range",
          "Mean Deviation",
          "Variance",
          "Standard Deviation",
          "Analysis of Frequency Distributions"
        ]
      },
      {
        "ch": "Unit V - Ch 14: Probability",
        "topics": [
          "Random Experiments",
          "Events",
          "Axiomatic Approach"
        ]
      }
    ],
    "Physics": [
      {
        "ch": "Units and Measurements",
        "topics": [
          "Need for Measurement",
          "Units of Measurement",
          "System of Units",
          "SI Units",
          "Fundamental and Derived Units",
          "Dimensions",
          "Dimensional Analysis",
          "Significant Figures"
        ]
      },
      {
        "ch": "Motion in a Straight Line",
        "topics": [
          "Position, Path Length and Displacement",
          "Average Velocity and Speed",
          "Acceleration",
          "Kinematic Equations",
          "Relative Velocity",
          "Graphical Analysis"
        ]
      },
      {
        "ch": "Motion in a Plane",
        "topics": [
          "Scalars and Vectors",
          "Multiplication of Vectors",
          "Motion in a Plane",
          "Projectile Motion",
          "Uniform Circular Motion"
        ]
      },
      {
        "ch": "Laws of Motion",
        "topics": [
          "Aristotle's Fallacy",
          "Inertia",
          "Newton's First, Second and Third Laws",
          "Conservation of Momentum",
          "Equilibrium of a Particle",
          "Common Forces",
          "Solving Problems",
          "Circular Motion"
        ]
      },
      {
        "ch": "Work, Energy and Power",
        "topics": [
          "Work-Energy Theorem",
          "Kinetic Energy",
          "Potential Energy",
          "Conservation of Mechanical Energy",
          "Potential Energy of a Spring",
          "Collisions",
          "Power"
        ]
      },
      {
        "ch": "System of Particles and Rotational Motion",
        "topics": [
          "Centre of Mass",
          "Linear Momentum",
          "Angular Velocity",
          "Torque and Angular Momentum",
          "Equilibrium",
          "Moment of Inertia",
          "Rolling Motion"
        ]
      },
      {
        "ch": "Gravitation",
        "topics": [
          "Kepler's Laws",
          "Newton's Universal Law of Gravitation",
          "Acceleration due to Gravity",
          "Gravitational Potential Energy",
          "Escape Velocity",
          "Earth Satellites",
          "Energy of an Orbiting Satellite"
        ]
      },
      {
        "ch": "Mechanical Properties of Solids",
        "topics": [
          "Elastic Behaviour",
          "Stress and Strain",
          "Hooke's Law",
          "Stress-Strain Curve",
          "Elastic Moduli",
          "Application of Elastic Behaviour"
        ]
      },
      {
        "ch": "Mechanical Properties of Fluids",
        "topics": [
          "Pressure",
          "Pascal's Law",
          "Variation of Pressure",
          "Viscosity",
          "Bernoulli's Principle",
          "Surface Tension"
        ]
      },
      {
        "ch": "Thermal Properties of Matter",
        "topics": [
          "Temperature and Heat",
          "Measurement of Temperature",
          "Thermal Expansion",
          "Specific Heat Capacity",
          "Calorimetry",
          "Change of State",
          "Heat Transfer"
        ]
      },
      {
        "ch": "Thermodynamics",
        "topics": [
          "Thermal Equilibrium",
          "Zeroth Law",
          "First Law",
          "Specific Heat Capacity",
          "Thermodynamic State Variables",
          "Second Law",
          "Reversible and Irreversible Processes",
          "Carnot Engine"
        ]
      },
      {
        "ch": "Kinetic Theory",
        "topics": [
          "Molecular Nature of Matter",
          "Behaviour of Gases",
          "Kinetic Theory of an Ideal Gas",
          "Law of Equipartition",
          "Specific Heat Capacity",
          "Mean Free Path"
        ]
      },
      {
        "ch": "Oscillations",
        "topics": [
          "Periodic and Oscillatory Motion",
          "Simple Harmonic Motion",
          "Energy in SHM",
          "Oscillations Due to a Spring",
          "Simple Pendulum",
          "Damped and Forced Oscillations",
          "Resonance"
        ]
      },
      {
        "ch": "Waves",
        "topics": [
          "Transverse and Longitudinal Waves",
          "Displacement Relation",
          "Speed of a Travelling Wave",
          "Principle of Superposition",
          "Reflection of Waves",
          "Standing Waves",
          "Beats",
          "Doppler Effect"
        ]
      }
    ],
    "Chemistry": [
      {
        "ch": "Some Basic Concepts of Chemistry",
        "topics": [
          "Importance of Chemistry",
          "Nature of Matter",
          "Properties of Matter",
          "Uncertainty in Measurement",
          "Laws of Chemical Combination",
          "Dalton's Atomic Theory",
          "Atomic and Molecular Masses",
          "Mole Concept",
          "Molar Mass",
          "Percentage Composition",
          "Empirical and Molecular Formula",
          "Stoichiometry"
        ]
      },
      {
        "ch": "Structure of Atom",
        "topics": [
          "Discovery of Subatomic Particles",
          "Atomic Models",
          "Rutherford's Model",
          "Bohr's Model",
          "Quantum Mechanical Model",
          "Electronic Configuration",
          "Aufbau Principle",
          "Pauli's Exclusion",
          "Hund's Rule",
          "Orbitals"
        ]
      },
      {
        "ch": "Classification of Elements and Periodicity in Properties",
        "topics": [
          "Genesis of Periodic Classification",
          "Modern Periodic Law",
          "Nomenclature",
          "Electronic Configurations",
          "Periodic Trends: Atomic/Ionic Radii, Ionization Enthalpy, Electron Gain Enthalpy, Electronegativity, Valence, Metallic Character"
        ]
      },
      {
        "ch": "Chemical Bonding and Molecular Structure",
        "topics": [
          "Kössel-Lewis Approach",
          "Ionic Bonding",
          "Bond Parameters",
          "Valence Shell Electron Pair Repulsion Theory",
          "Valence Bond Theory",
          "Hybridisation",
          "Molecular Orbital Theory",
          "Hydrogen Bonding"
        ]
      },
      {
        "ch": "Thermodynamics",
        "topics": [
          "Terms and Concepts",
          "Applications",
          "Measurement of Delta U and Delta H",
          "Enthalpy Changes",
          "Hess's Law",
          "Bond Enthalpies",
          "Spontaneity",
          "Gibbs Energy"
        ]
      },
      {
        "ch": "Equilibrium",
        "topics": [
          "Equilibrium in Physical Processes",
          "Equilibrium in Chemical Processes",
          "Law of Mass Action",
          "Equilibrium Constant",
          "Homogeneous and Heterogeneous Equilibria",
          "Applications",
          "Relationship Between Kp and Kc",
          "Factors Affecting Equilibria",
          "Le Chatelier's Principle",
          "Ionic Equilibrium"
        ]
      },
      {
        "ch": "Redox Reactions",
        "topics": [
          "Classical Idea",
          "Redox Reactions in Terms of Electron Transfer",
          "Oxidation Number",
          "Balancing",
          "Types of Redox Reactions",
          "Applications"
        ]
      },
      {
        "ch": "Organic Chemistry - Some Basic Principles and Techniques",
        "topics": [
          "General Introduction",
          "Tetravalence of Carbon",
          "Structural Representations",
          "Classification",
          "Nomenclature",
          "Isomerism",
          "Fundamental Concepts",
          "Methods of Purification",
          "Qualitative and Quantitative Analysis"
        ]
      },
      {
        "ch": "Hydrocarbons",
        "topics": [
          "Classification",
          "Alkanes",
          "Alkenes",
          "Alkynes",
          "Aromatic Hydrocarbons",
          "Carcinogenicity and Toxicity"
        ]
      }
    ],
    "Biology": [
      {
        "ch": "The Living World",
        "topics": [
          "Diversity of Life",
          "Taxonomy",
          "Nomenclature",
          "Taxonomic Categories"
        ]
      },
      {
        "ch": "Biological Classification",
        "topics": [
          "Five Kingdom Classification",
          "Monera",
          "Protista",
          "Fungi",
          "Viruses, Viroids, Prions, and Lichens"
        ]
      },
      {
        "ch": "Plant Kingdom",
        "topics": [
          "Algae",
          "Bryophytes",
          "Pteridophytes",
          "Gymnosperms",
          "Angiosperms"
        ]
      },
      {
        "ch": "Animal Kingdom",
        "topics": [
          "Basis of Classification",
          "Non-chordates",
          "Chordates",
          "Animal Body Plans"
        ]
      },
      {
        "ch": "Morphology of Flowering Plants",
        "topics": [
          "Root, Stem, and Leaf",
          "Flower",
          "Fruit and Seed",
          "Plant Families"
        ]
      },
      {
        "ch": "Anatomy of Flowering Plants",
        "topics": [
          "Plant Tissues",
          "Anatomy of Root, Stem, and Leaf",
          "Secondary Growth"
        ]
      },
      {
        "ch": "Structural Organisation in Animals",
        "topics": [
          "Animal Tissues",
          "Organ Systems",
          "Earthworm, Cockroach, and Frog"
        ]
      },
      {
        "ch": "Cell: The Unit of Life",
        "topics": [
          "Cell Theory",
          "Prokaryotic and Eukaryotic Cells",
          "Cell Organelles",
          "Cell Envelope"
        ]
      },
      {
        "ch": "Biomolecules",
        "topics": [
          "Carbohydrates, Proteins, and Lipids",
          "Nucleic Acids",
          "Enzymes",
          "Metabolism"
        ]
      },
      {
        "ch": "Cell Cycle and Cell Division",
        "topics": [
          "Cell Cycle",
          "Mitosis",
          "Meiosis",
          "Significance of Cell Division"
        ]
      },
      {
        "ch": "Photosynthesis in Higher Plants",
        "topics": [
          "Photosynthetic Pigments",
          "Light Reaction",
          "Calvin Cycle",
          "Factors Affecting Photosynthesis"
        ]
      },
      {
        "ch": "Respiration in Plants",
        "topics": [
          "Glycolysis",
          "Fermentation",
          "Aerobic Respiration",
          "Respiratory Balance Sheet"
        ]
      },
      {
        "ch": "Plant Growth and Development",
        "topics": [
          "Growth",
          "Differentiation",
          "Plant Growth Regulators",
          "Photoperiodism and Vernalisation"
        ]
      },
      {
        "ch": "Breathing and Exchange of Gases",
        "topics": [
          "Respiratory Organs",
          "Mechanism of Breathing",
          "Exchange and Transport of Gases",
          "Respiratory Disorders"
        ]
      },
      {
        "ch": "Body Fluids and Circulation",
        "topics": [
          "Blood and Lymph",
          "Human Circulatory System",
          "Cardiac Cycle",
          "Circulatory Disorders"
        ]
      },
      {
        "ch": "Excretory Products and their Elimination",
        "topics": [
          "Human Excretory System",
          "Urine Formation",
          "Regulation of Kidney Function",
          "Excretory Disorders"
        ]
      },
      {
        "ch": "Locomotion and Movement",
        "topics": [
          "Muscles",
          "Skeletal System",
          "Joints",
          "Disorders of Muscular and Skeletal System"
        ]
      },
      {
        "ch": "Neural Control and Coordination",
        "topics": [
          "Neurons",
          "Nerve Impulse",
          "Central Nervous System",
          "Sense Organs"
        ]
      },
      {
        "ch": "Chemical Coordination and Integration",
        "topics": [
          "Endocrine Glands",
          "Hormones",
          "Mechanism of Hormone Action",
          "Feedback Control"
        ]
      }
    ],
    "History": [
      {
        "ch": "Writing and City Life",
        "topics": [
          "Mesopotamia: Urbanisation, Writing, Trade, Social Organisation"
        ]
      },
      {
        "ch": "An Empire Across Three Continents",
        "topics": [
          "Roman Empire: Administration, Army, Trade, Culture"
        ]
      },
      {
        "ch": "Nomadic Empires",
        "topics": [
          "Mongol Empire: Genghis Khan, Military, Administration, Impact"
        ]
      },
      {
        "ch": "The Three Orders",
        "topics": [
          "Medieval Europe: Feudalism, Church, Social Hierarchy"
        ]
      },
      {
        "ch": "Changing Cultural Traditions",
        "topics": [
          "European Renaissance: Art, Science, Humanism"
        ]
      },
      {
        "ch": "Confrontation of Cultures",
        "topics": [
          "Age of Discovery: Americas, Colonialism, Exchange"
        ]
      }
    ],
    "Geography": [
      {
        "ch": "Geography as a Discipline",
        "topics": [
          "Nature of Geography",
          "Physical and Human Geography",
          "Branches"
        ]
      },
      {
        "ch": "The Origin and Evolution of the Earth",
        "topics": [
          "Early Theories",
          "Formation of Planets",
          "Moon",
          "Evolution",
          "Geological Time Scale"
        ]
      },
      {
        "ch": "Interior of the Earth",
        "topics": [
          "Sources of Information",
          "Earth's Structure",
          "Rocks",
          "Minerals"
        ]
      },
      {
        "ch": "Distribution of Oceans and Continents",
        "topics": [
          "Continental Drift",
          "Plate Tectonics",
          "Sea Floor Spreading"
        ]
      },
      {
        "ch": "Minerals and Rocks",
        "topics": [
          "Classification",
          "Types of Rocks",
          "Rock Cycle"
        ]
      },
      {
        "ch": "Geomorphic Processes",
        "topics": [
          "Weathering",
          "Erosion",
          "Mass Wasting",
          "Landforms"
        ]
      }
    ],
    "Civics": [
      {
        "ch": "Constitution: Why and How?",
        "topics": [
          "Meaning",
          "Authority and Legitimacy",
          "Constituent Assembly",
          "Philosophy"
        ]
      },
      {
        "ch": "Rights in the Indian Constitution",
        "topics": [
          "Fundamental Rights",
          "Directive Principles",
          "Fundamental Duties"
        ]
      },
      {
        "ch": "Election and Representation",
        "topics": [
          "Elections",
          "Electoral System",
          "Representation",
          "Free and Fair Elections"
        ]
      },
      {
        "ch": "Legislature",
        "topics": [
          "Parliament",
          "Functions",
          "Legislative Process",
          "Committees"
        ]
      },
      {
        "ch": "Executive",
        "topics": [
          "President",
          "Prime Minister",
          "Council of Ministers",
          "Bureaucracy"
        ]
      },
      {
        "ch": "Judiciary",
        "topics": [
          "Supreme Court",
          "High Courts",
          "Judicial Review",
          "Independence"
        ]
      }
    ],
    "Economics": [
      {
        "ch": "Statistics for Economics",
        "topics": [
          "Collection of Data",
          "Organisation of Data",
          "Presentation",
          "Measures of Central Tendency",
          "Correlation",
          "Index Numbers"
        ]
      },
      {
        "ch": "Indian Economic Development",
        "topics": [
          "Indian Economy on Eve of Independence",
          "Economic Planning",
          "Liberalisation",
          "Poverty",
          "Human Capital",
          "Rural Development",
          "Employment",
          "Infrastructure",
          "Environment",
          "Comparative Development"
        ]
      }
    ],
    "English": [
      {
        "ch": "Prose 1: The Portrait of a Lady",
        "topics": [
          "Hornbill - Khushwant Singh's memoir about his grandmother"
        ]
      },
      {
        "ch": "Poem 1: The Address",
        "topics": [
          "Hornbill - Marga Minco's story about loss and memory"
        ]
      },
      {
        "ch": "Poem 1: We're Not Afraid to Die",
        "topics": [
          "Hornbill - Gordon Cook's account of survival at sea"
        ]
      },
      {
        "ch": "Poem 2: Laburnum Top",
        "topics": [
          "Hornbill - Ted Hughes' poem about nature"
        ]
      },
      {
        "ch": "Prose 2: Discovering Tut: The Saga Continues",
        "topics": [
          "Hornbill - A.R. Williams' archaeological account"
        ]
      },
      {
        "ch": "Poem 3: The Voice of the Rain",
        "topics": [
          "Hornbill - Walt Whitman's poem"
        ]
      },
      {
        "ch": "Prose 3: Landscape of the Soul",
        "topics": [
          "Hornbill - Nathalie Trouveroy's essay on Chinese art"
        ]
      },
      {
        "ch": "Poem 4: Childhood",
        "topics": [
          "Hornbill - Markus Natten's poem about growing up"
        ]
      },
      {
        "ch": "Prose 4: The Adventure",
        "topics": [
          "Hornbill - Jayant Narlikar's science fiction"
        ]
      },
      {
        "ch": "Poem 5: Father to Son",
        "topics": [
          "Hornbill - Elizabeth Jennings' poem about relationships"
        ]
      },
      {
        "ch": "Prose 5: Silk Road",
        "topics": [
          "Hornbill - Nick Middleton's travelogue"
        ]
      },
      {
        "ch": "Snapshots 1: The Summer of the Beautiful White Horse",
        "topics": [
          "Snapshots - William Saroyan's story"
        ]
      },
      {
        "ch": "Snapshots 2: The Address",
        "topics": [
          "Snapshots - Marga Minco's story"
        ]
      },
      {
        "ch": "Snapshots 3: Ranga's Marriage",
        "topics": [
          "Snapshots - Masti Venkatesha Iyengar's story"
        ]
      },
      {
        "ch": "Snapshots 4: Albert Einstein at School",
        "topics": [
          "Snapshots - Patrick Pringle's account"
        ]
      },
      {
        "ch": "Snapshots 5: Mother's Day",
        "topics": [
          "Snapshots - J.B. Priestley's play"
        ]
      },
      {
        "ch": "Snapshots 6: The Ghat of the Only World",
        "topics": [
          "Snapshots - Amitav Ghosh's essay"
        ]
      },
      {
        "ch": "Snapshots 7: Birth",
        "topics": [
          "Snapshots - A.J. Cronin's story"
        ]
      },
      {
        "ch": "Snapshots 8: The Tale of Melon City",
        "topics": [
          "Snapshots - Vikram Seth's humorous poem"
        ]
      }
    ],
    "Hindi": [
      {
        "ch": "भारत-एक खोज (रामचंद्र शुक्ल)",
        "topics": [
          "पाठ्यपुस्तक: आरोह भाग 1 - निबंध"
        ]
      },
      {
        "ch": "मंगलजय (माथिलीशरण गुप्त)",
        "topics": [
          "पाठ्यपुस्तक: आरोह भाग 1 - कविता"
        ]
      },
      {
        "ch": "संगतकार (मंगलेश डबराल)",
        "topics": [
          "पाठ्यपुस्तक: आरोह भाग 1 - संस्मरण"
        ]
      },
      {
        "ch": "सूर्दास के पद",
        "topics": [
          "पाठ्यपुस्तक: आरोह भाग 1 - पद"
        ]
      },
      {
        "ch": "तुलसीदास: रामचरितमानस (बालकांड)",
        "topics": [
          "पाठ्यपुस्तक: आरोह भाग 1 - रामचरितमानस"
        ]
      },
      {
        "ch": "दुष्यंत कुमार की कविता",
        "topics": [
          "पाठ्यपुस्तक: आरोह भाग 1 - कविता"
        ]
      },
      {
        "ch": "अपठित गद्यांश और पद्यांश",
        "topics": [
          "पाठ्यपुस्तक: आरोह भाग 1 - अपठित"
        ]
      },
      {
        "ch": "व्याकरण: भाषा, बोली और लिपि",
        "topics": [
          "व्याकरण अध्याय"
        ]
      },
      {
        "ch": "व्याकरण: शब्द विचार और वाक्य विचार",
        "topics": [
          "व्याकरण अध्याय"
        ]
      },
      {
        "ch": "रचनात्मक लेखन",
        "topics": [
          "पत्र लेखन, निबंध लेखन, संपादकीय"
        ]
      }
    ],
    "Basic Computer": [
      {
        "ch": "Programming and Computational Thinking",
        "topics": [
          "Python Revision",
          "Functions",
          "Exception Handling",
          "File Handling (Text, Binary, CSV)",
          "Data Structures: Stack",
          "Sorting: Bubble, Insertion, Selection"
        ]
      },
      {
        "ch": "Computer Systems and Organisation",
        "topics": [
          "Basic Computer Organisation",
          "Boolean Logic",
          "Number Representation",
          "Encoding Schemes",
          "Types of Software",
          "Memory Units",
          "Computer organisation: CPU, memory, I/O",
          "Boolean logic: AND, OR, NOT, NAND, NOR, XOR",
          "Truth tables",
          "De Morgan's laws",
          "Number representation",
          "Encoding schemes",
          "Types of software",
          "Program execution flow"
        ]
      },
      {
        "ch": "Database Management",
        "topics": [
          "Relational Databases",
          "Keys",
          "MySQL: CREATE, INSERT, SELECT, UPDATE, DELETE, ALTER, DROP",
          "Functions",
          "Grouping",
          "Joins",
          "Python-MySQL Connectivity",
          "Relational data model",
          "MySQL: installation and setup",
          "DDL: CREATE, ALTER, DROP",
          "DML: INSERT, UPDATE, DELETE",
          "DQL: SELECT, WHERE, ORDER BY, GROUP BY",
          "Aggregate functions",
          "Python-MySQL connectivity"
        ]
      },
      {
        "ch": "Society, Law and Ethics",
        "topics": [
          "Cyber Safety",
          "Intellectual Property",
          "Privacy Laws",
          "Digital Footprint",
          "Cyber Crime",
          "IT Act",
          "E-waste",
          "Information Security",
          "Cyber safety",
          "Identity protection",
          "Confidentiality",
          "Social networks",
          "Cyber trolls and bullying",
          "Malware",
          "Secure connections",
          "Phishing",
          "Appropriate usage",
          "Digital wellness"
        ]
      },
      {
        "ch": "Python Programming and Computational Thinking",
        "topics": [
          "Python fundamentals revision",
          "Control structures",
          "Strings and string manipulation",
          "Lists, tuples, dictionaries",
          "File handling: text, binary, CSV",
          "Exception handling",
          "Computational thinking concepts"
        ]
      },
      {
        "ch": "Functions and Data Structures",
        "topics": [
          "User-defined functions",
          "Parameters and arguments",
          "Default parameters",
          "Scope of variables",
          "Lists: operations and methods",
          "Stacks and queues implementation",
          "Searching: linear and binary",
          "Sorting: bubble, insertion, selection"
        ]
      },
      {
        "ch": "Web Development with Python (Optional)",
        "topics": [
          "HTML5 and CSS3",
          "Flask/Django basics",
          "Creating web applications",
          "Routing",
          "Templates",
          "Form handling",
          "Database integration",
          "Deployment basics"
        ]
      },
      {
        "ch": "Data Handling and Visualization",
        "topics": [
          "NumPy basics",
          "Pandas for data manipulation",
          "Matplotlib for visualization",
          "Data cleaning",
          "Simple statistical analysis",
          "Project: Analyzing real-world dataset"
        ]
      },
      {
        "ch": "Introduction to AI and ML",
        "topics": [
          "What is AI?",
          "Types of AI",
          "Machine learning types: supervised, unsupervised, reinforcement",
          "Python libraries: scikit-learn basics",
          "Simple classification and regression",
          "Ethical considerations"
        ]
      }
    ]
  },
  "12": {
    "Mathematics": [
      {
        "ch": "Relations and Functions",
        "topics": [
          "Types of Relations",
          "Types of Functions",
          "Composition",
          "Invertible Functions",
          "Binary Operations"
        ]
      },
      {
        "ch": "Inverse Trigonometric Functions",
        "topics": [
          "Definition",
          "Range",
          "Domain",
          "Principal Value",
          "Properties",
          "Elementary Properties"
        ]
      },
      {
        "ch": "Matrices",
        "topics": [
          "Definition",
          "Types",
          "Operations",
          "Transpose",
          "Symmetric and Skew-Symmetric",
          "Elementary Operation",
          "Invertible Matrices"
        ]
      },
      {
        "ch": "Determinants",
        "topics": [
          "Definition",
          "Properties",
          "Area of Triangle",
          "Minors and Cofactors",
          "Adjoint and Inverse",
          "Applications"
        ]
      },
      {
        "ch": "Continuity and Differentiability",
        "topics": [
          "Continuity",
          "Differentiability",
          "Exponential and Logarithmic Functions",
          "Logarithmic Differentiation",
          "Second Order Derivatives",
          "Mean Value Theorem"
        ]
      },
      {
        "ch": "Application of Derivatives",
        "topics": [
          "Rate of Change",
          "Increasing and Decreasing Functions",
          "Tangents and Normals",
          "Approximations",
          "Maxima and Minima"
        ]
      },
      {
        "ch": "Integrals",
        "topics": [
          "Integration as Inverse Process",
          "Methods: Substitution, Partial Fractions, Parts",
          "Definite Integrals",
          "Fundamental Theorem",
          "Evaluation by Substitution",
          "Properties"
        ]
      },
      {
        "ch": "Application of Integrals",
        "topics": [
          "Area Under Curves",
          "Area Between Curves"
        ]
      },
      {
        "ch": "Differential Equations",
        "topics": [
          "Definition",
          "Order and Degree",
          "General and Particular Solutions",
          "Formation",
          "Methods of Solving"
        ]
      },
      {
        "ch": "Vector Algebra",
        "topics": [
          "Vectors and Scalars",
          "Direction Cosines",
          "Types",
          "Addition",
          "Components",
          "Vector Joining Two Points",
          "Section Formula",
          "Product of Vectors"
        ]
      },
      {
        "ch": "Three Dimensional Geometry",
        "topics": [
          "Direction Cosines and Ratios",
          "Equation of a Line",
          "Angle Between Lines",
          "Shortest Distance",
          "Plane",
          "Angle Between Planes",
          "Distance of a Point",
          "Coplanarity"
        ]
      },
      {
        "ch": "Linear Programming",
        "topics": [
          "Introduction",
          "Linear Programming Problem",
          "Mathematical Formulation",
          "Graphical Method",
          "Types of Linear Programming Problems"
        ]
      },
      {
        "ch": "Probability",
        "topics": [
          "Conditional Probability",
          "Multiplication Theorem",
          "Independent Events",
          "Bayes' Theorem",
          "Random Variables",
          "Probability Distribution",
          "Bernoulli Trials",
          "Binomial Distribution"
        ]
      }
    ],
    "Physics": [
      {
        "ch": "Electric Charges and Fields",
        "topics": [
          "Electric Charge",
          "Conductors and Insulators",
          "Charging by Induction",
          "Coulomb's Law",
          "Forces Between Multiple Charges",
          "Electric Field",
          "Electric Field Lines",
          "Electric Dipole",
          "Continuous Charge Distribution",
          "Gauss's Law",
          "Applications"
        ]
      },
      {
        "ch": "Electrostatic Potential and Capacitance",
        "topics": [
          "Electrostatic Potential",
          "Potential due to a Point Charge",
          "Equipotential Surfaces",
          "Potential Energy",
          "Electrostatics of Conductors",
          "Dielectrics and Polarisation",
          "Capacitors and Capacitance",
          "Combination of Capacitors",
          "Energy Stored"
        ]
      },
      {
        "ch": "Current Electricity",
        "topics": [
          "Electric Current",
          "Ohm's Law",
          "Drift of Electrons",
          "Mobility",
          "Limitations of Ohm's Law",
          "Resistivity",
          "Electrical Energy and Power",
          "Combination of Resistors",
          "Cells, EMF, Internal Resistance",
          "Kirchhoff's Laws",
          "Wheatstone Bridge",
          "Meter Bridge",
          "Potentiometer"
        ]
      },
      {
        "ch": "Moving Charges and Magnetism",
        "topics": [
          "Magnetic Force",
          "Motion in a Magnetic Field",
          "Biot-Savart Law",
          "Magnetic Field on Axis of Circular Current Loop",
          "Ampere's Circuital Law",
          "Solenoid",
          "Force between Parallel Currents",
          "Torque on Current Loop",
          "Moving Coil Galvanometer"
        ]
      },
      {
        "ch": "Magnetism and Matter",
        "topics": [
          "The Bar Magnet",
          "Magnetism and Gauss's Law",
          "Magnetisation",
          "Magnetic Intensity",
          "Magnetic Properties of Materials",
          "Diamagnetism, Paramagnetism, Ferromagnetism",
          "Hysteresis",
          "Permanent Magnets and Electromagnets"
        ]
      },
      {
        "ch": "Electromagnetic Induction",
        "topics": [
          "Experiments of Faraday and Henry",
          "Magnetic Flux",
          "Faraday's Law of Induction",
          "Lenz's Law",
          "Motional EMF",
          "Eddy Currents",
          "Inductance",
          "AC Generator"
        ]
      },
      {
        "ch": "Alternating Current",
        "topics": [
          "AC Voltage Applied to Resistor, Inductor, Capacitor",
          "Phasors",
          "LCR Circuit",
          "Resonance",
          "Power in AC Circuit",
          "LC Oscillations",
          "Transformers"
        ]
      },
      {
        "ch": "Electromagnetic Waves",
        "topics": [
          "Displacement Current",
          "Electromagnetic Waves",
          "Characteristics",
          "Electromagnetic Spectrum: Radio Waves, Microwaves, Infrared, Visible, UV, X-rays, Gamma Rays"
        ]
      },
      {
        "ch": "Ray Optics and Optical Instruments",
        "topics": [
          "Reflection of Light",
          "Spherical Mirrors",
          "Refraction",
          "Total Internal Reflection",
          "Refraction at Spherical Surfaces",
          "Lenses",
          "Prism",
          "Optical Instruments: Eye, Microscope, Telescope"
        ]
      },
      {
        "ch": "Wave Optics",
        "topics": [
          "Huygens Principle",
          "Refraction and Reflection",
          "Interference",
          "Young's Double Slit Experiment",
          "Coherent Sources",
          "Diffraction",
          "Polarisation"
        ]
      },
      {
        "ch": "Dual Nature of Radiation and Matter",
        "topics": [
          "Electron Emission",
          "Photoelectric Effect",
          "Wave Theory",
          "Einstein's Photoelectric Equation",
          "Particle Nature of Light",
          "Wave Nature of Matter",
          "de Broglie Relation",
          "Davisson-Germer Experiment"
        ]
      },
      {
        "ch": "Atoms",
        "topics": [
          "Alpha-Particle Scattering",
          "Rutherford's Nuclear Model",
          "Atomic Spectra",
          "Bohr Model",
          "de Broglie Explanation",
          "Quantum Mechanics"
        ]
      },
      {
        "ch": "Nuclei",
        "topics": [
          "Atomic Masses",
          "Composition and Size",
          "Mass-Energy",
          "Nuclear Binding Energy",
          "Nuclear Force",
          "Radioactivity",
          "Nuclear Energy: Fission and Fusion"
        ]
      },
      {
        "ch": "Semiconductor Electronics",
        "topics": [
          "Classification",
          "Intrinsic and Extrinsic Semiconductors",
          "p-n Junction",
          "Junction Diode",
          "Application",
          "Junction Transistor",
          "Digital Electronics",
          "Logic Gates",
          "Integrated Circuits"
        ]
      }
    ],
    "Chemistry": [
      {
        "ch": "Solutions",
        "topics": [
          "Types of Solutions",
          "Concentration of Solutions",
          "Solubility",
          "Vapour Pressure of Liquid Solutions",
          "Ideal and Non-ideal Solutions",
          "Colligative Properties",
          "Abnormal Molar Masses"
        ]
      },
      {
        "ch": "Electrochemistry",
        "topics": [
          "Electrochemical Cells",
          "Galvanic Cells",
          "Nernst Equation",
          "Conductance",
          "Conductance of Electrolytic Solutions",
          "Electrolysis",
          "Batteries",
          "Fuel Cells",
          "Corrosion"
        ]
      },
      {
        "ch": "Chemical Kinetics",
        "topics": [
          "Rate of a Chemical Reaction",
          "Factors Influencing Rate",
          "Integrated Rate Equations",
          "Temperature Dependence",
          "Collision Theory of Chemical Reactions"
        ]
      },
      {
        "ch": "The d- and f-Block Elements",
        "topics": [
          "Position in the Periodic Table",
          "Electronic Configurations",
          "General Properties of Transition Elements",
          "Some Important Compounds",
          "Lanthanoids",
          "Actinoids",
          "Applications of d- and f-Block Elements"
        ]
      },
      {
        "ch": "Coordination Compounds",
        "topics": [
          "Werner's Theory",
          "Definitions",
          "Nomenclature",
          "Isomerism",
          "Bonding",
          "Bonding in Metal Carbonyls",
          "Applications of Coordination Compounds"
        ]
      },
      {
        "ch": "Haloalkanes and Haloarenes",
        "topics": [
          "Classification",
          "Nomenclature",
          "Nature of C-X Bond",
          "Methods of Preparation",
          "Physical Properties",
          "Reactions",
          "Polyhalogen Compounds"
        ]
      },
      {
        "ch": "Alcohols, Phenols and Ethers",
        "topics": [
          "Classification",
          "Nomenclature",
          "Structures",
          "Alcohols and Phenols",
          "Commercially Important Alcohols",
          "Ethers"
        ]
      },
      {
        "ch": "Aldehydes, Ketones and Carboxylic Acids",
        "topics": [
          "Nomenclature and Structure",
          "Preparation of Aldehydes and Ketones",
          "Physical Properties",
          "Chemical Reactions",
          "Carboxylic Acids",
          "Uses of Carboxylic Acids"
        ]
      },
      {
        "ch": "Amines",
        "topics": [
          "Structure of Amines",
          "Classification",
          "Nomenclature",
          "Preparation of Amines",
          "Physical Properties",
          "Chemical Reactions",
          "Diazonium Salts"
        ]
      },
      {
        "ch": "Biomolecules",
        "topics": [
          "Carbohydrates",
          "Proteins",
          "Enzymes",
          "Vitamins",
          "Nucleic Acids",
          "Hormones"
        ]
      }
    ],
    "Biology": [
      {
        "ch": "Sexual Reproduction in Flowering Plants",
        "topics": [
          "Flower Structure",
          "Pre-fertilisation Events",
          "Double Fertilisation",
          "Post-fertilisation Events",
          "Apomixis and Polyembryony"
        ]
      },
      {
        "ch": "Human Reproduction",
        "topics": [
          "Male Reproductive System",
          "Female Reproductive System",
          "Gametogenesis",
          "Menstrual Cycle",
          "Fertilisation and Implantation"
        ]
      },
      {
        "ch": "Reproductive Health",
        "topics": [
          "Reproductive Health Problems and Strategies",
          "Population Stabilisation",
          "Contraception",
          "Medical Termination of Pregnancy",
          "Infertility"
        ]
      },
      {
        "ch": "Principles of Inheritance and Variation",
        "topics": [
          "Mendelian Inheritance",
          "Inheritance of One Gene",
          "Inheritance of Two Genes",
          "Sex Determination",
          "Mutation and Genetic Disorders"
        ]
      },
      {
        "ch": "Molecular Basis of Inheritance",
        "topics": [
          "DNA and RNA",
          "Replication",
          "Transcription",
          "Genetic Code",
          "Translation",
          "Gene Regulation"
        ]
      },
      {
        "ch": "Evolution",
        "topics": [
          "Origin of Life",
          "Evolution of Life Forms",
          "Evidence for Evolution",
          "Hardy-Weinberg Principle",
          "Human Evolution"
        ]
      },
      {
        "ch": "Human Health and Disease",
        "topics": [
          "Common Diseases",
          "Immunity",
          "AIDS",
          "Cancer",
          "Drug and Alcohol Abuse"
        ]
      },
      {
        "ch": "Microbes in Human Welfare",
        "topics": [
          "Microbes in Household Products",
          "Industrial Products",
          "Sewage Treatment",
          "Biogas",
          "Biocontrol and Biofertilisers"
        ]
      },
      {
        "ch": "Biotechnology: Principles and Processes",
        "topics": [
          "Principles of Biotechnology",
          "Recombinant DNA Technology",
          "Tools of Biotechnology",
          "PCR and Cloning"
        ]
      },
      {
        "ch": "Biotechnology and its Applications",
        "topics": [
          "Biotechnology in Agriculture",
          "Biotechnology in Medicine",
          "Transgenic Animals",
          "Ethical Issues"
        ]
      },
      {
        "ch": "Organisms and Populations",
        "topics": [
          "Organism and Environment",
          "Population Attributes",
          "Population Growth",
          "Population Interactions"
        ]
      },
      {
        "ch": "Ecosystem",
        "topics": [
          "Ecosystem Structure",
          "Productivity",
          "Decomposition",
          "Energy Flow",
          "Ecological Pyramids",
          "Nutrient Cycling"
        ]
      },
      {
        "ch": "Biodiversity and Conservation",
        "topics": [
          "Biodiversity",
          "Patterns of Biodiversity",
          "Loss of Biodiversity",
          "Conservation",
          "Hotspots"
        ]
      }
    ],
    "History": [
      {
        "ch": "Themes in Indian History Part I",
        "topics": [
          "Bricks, Beads and Bones (Harappan Civilization)",
          "Kings, Farmers and Towns",
          "Kinship, Caste and Class",
          "Thinkers, Beliefs and Buildings"
        ]
      },
      {
        "ch": "Themes in Indian History Part II",
        "topics": [
          "Through the Eyes of Travellers",
          "Bhakti-Sufi Traditions",
          "An Imperial Capital: Vijayanagara",
          "Peasants, Zamindars and the State"
        ]
      },
      {
        "ch": "Themes in Indian History Part III",
        "topics": [
          "Colonialism and the Countryside",
          "Rebels and the Raj",
          "Mahatma Gandhi and the Nationalist Movement",
          "Framing the Constitution"
        ]
      }
    ],
    "Geography": [
      {
        "ch": "Fundamentals of Human Geography",
        "topics": [
          "Human Geography",
          "World Population",
          "Population Composition",
          "Human Development",
          "Primary, Secondary, Tertiary Activities",
          "Transport, Communication, Trade",
          "International Trade"
        ]
      },
      {
        "ch": "India - People and Economy",
        "topics": [
          "Population",
          "Migration",
          "Human Development",
          "Human Settlements",
          "Land Resources",
          "Water Resources",
          "Mineral and Energy Resources",
          "Manufacturing",
          "Planning"
        ]
      },
      {
        "ch": "Practical Work",
        "topics": [
          "Data Sources",
          "Data Processing",
          "Graphical Representation",
          "Spatial Information Technology"
        ]
      }
    ],
    "Civics": [
      {
        "ch": "Contemporary World Politics",
        "topics": [
          "Cold War Era",
          "End of Bipolarity",
          "US Hegemony",
          "Alternative Centres of Power",
          "Contemporary South Asia",
          "International Organisations",
          "Security",
          "Environment and Natural Resources",
          "Globalisation"
        ]
      },
      {
        "ch": "Politics in India Since Independence",
        "topics": [
          "Challenges of Nation Building",
          "Era of One-Party Dominance",
          "Politics of Planned Development",
          "India's External Relations",
          "Challenges to Restoration of Congress System",
          "Crisis of Democratic Order",
          "Regional Aspirations",
          "Recent Developments"
        ]
      }
    ],
    "Economics": [
      {
        "ch": "Introductory Macroeconomics",
        "topics": [
          "National Income",
          "Money and Banking",
          "Determination of Income and Employment",
          "Government Budget",
          "Balance of Payments",
          "Foreign Exchange Rate"
        ]
      },
      {
        "ch": "Indian Economic Development",
        "topics": [
          "Development Experience (1947-90)",
          "Economic Reforms",
          "Current Challenges",
          "Rural Development",
          "Human Capital",
          "Employment",
          "Infrastructure",
          "Environment",
          "Comparative Development Experiences"
        ]
      }
    ],
    "English": [
      {
        "ch": "Prose 1: The Last Lesson",
        "topics": [
          "Flamingo - Alphonse Daudet's story about language and identity"
        ]
      },
      {
        "ch": "Poem 1: My Mother at Sixty-Six",
        "topics": [
          "Flamingo - Kamala Das' poem about ageing and love"
        ]
      },
      {
        "ch": "Prose 2: Lost Spring",
        "topics": [
          "Flamingo - Anees Jung's story about child labour"
        ]
      },
      {
        "ch": "Poem 2: An Elementary School Classroom in a Slum",
        "topics": [
          "Flamingo - Stephen Spender's poem"
        ]
      },
      {
        "ch": "Prose 3: Deep Water",
        "topics": [
          "Flamingo - William Douglas' account of overcoming fear"
        ]
      },
      {
        "ch": "Poem 3: Keeping Quiet",
        "topics": [
          "Flamingo - Pablo Neruda's poem about peace"
        ]
      },
      {
        "ch": "Prose 4: The Rattrap",
        "topics": [
          "Flamingo - Selma Lagerlöf's story about human kindness"
        ]
      },
      {
        "ch": "Poem 4: A Thing of Beauty",
        "topics": [
          "Flamingo - John Keats' poem about nature's beauty"
        ]
      },
      {
        "ch": "Prose 5: Indigo",
        "topics": [
          "Flamingo - Louis Fischer's account of Gandhi's Champaran movement"
        ]
      },
      {
        "ch": "Poem 5: A Roadside Stand",
        "topics": [
          "Flamingo - Robert Frost's poem"
        ]
      },
      {
        "ch": "Prose 6: Poets and Pancakes",
        "topics": [
          "Flamingo - Asokamitran's memoir of Gemini Studios"
        ]
      },
      {
        "ch": "Poem 6: Aunt Jennifer's Tigers",
        "topics": [
          "Flamingo - Adrienne Rich's poem"
        ]
      },
      {
        "ch": "Prose 7: The Interview",
        "topics": [
          "Flamingo - Christopher Silvester's essay"
        ]
      },
      {
        "ch": "Prose 8: Going Places",
        "topics": [
          "Flamingo - A.R. Barton's story about dreams"
        ]
      },
      {
        "ch": "Vistas 1: The Third Level",
        "topics": [
          "Vistas - Jack Finney's science fiction"
        ]
      },
      {
        "ch": "Vistas 2: The Tiger King",
        "topics": [
          "Vistas - Kalki's satirical story"
        ]
      },
      {
        "ch": "Vistas 3: Journey to the End of the Earth",
        "topics": [
          "Vistas - Tishani Doshi's travelogue"
        ]
      },
      {
        "ch": "Vistas 4: The Enemy",
        "topics": [
          "Vistas - Pearl S. Buck's story about humanity"
        ]
      },
      {
        "ch": "Vistas 5: Should Wizard Hit Mommy",
        "topics": [
          "Vistas - John Updike's story"
        ]
      },
      {
        "ch": "Vistas 6: On the Face of It",
        "topics": [
          "Vistas - Susan Hill's play about disability"
        ]
      },
      {
        "ch": "Vistas 7: Evans Tries an O-Level",
        "topics": [
          "Vistas - Colin Dexter's detective story"
        ]
      },
      {
        "ch": "Vistas 8: Memories of Childhood",
        "topics": [
          "Vistas - Zitkala-Sa and Bama's accounts"
        ]
      }
    ],
    "Hindi": [
      {
        "ch": "आत्मकथ्य (हरिवंश राय बच्चन)",
        "topics": [
          "पाठ्यपुस्तक: आरोह भाग 2 - आत्मकथा"
        ]
      },
      {
        "ch": "पद (सूरदास)",
        "topics": [
          "पाठ्यपुस्तक: आरोह भाग 2 - पद"
        ]
      },
      {
        "ch": "राम-लक्ष्मण-परशुराम संवाद (तुलसीदास)",
        "topics": [
          "पाठ्यपुस्तक: आरोह भाग 2 - रामचरितमानस"
        ]
      },
      {
        "ch": "संगतकार (मंगलेश डबराल)",
        "topics": [
          "पाठ्यपुस्तक: आरोह भाग 2 - संस्मरण"
        ]
      },
      {
        "ch": "मेरे तो गिरधर गोपाल (मीराबाई)",
        "topics": [
          "पाठ्यपुस्तक: आरोह भाग 2 - पद"
        ]
      },
      {
        "ch": "मनुष्यता (मैथिलीशरण गुप्त)",
        "topics": [
          "पाठ्यपुस्तक: आरोह भाग 2 - कविता"
        ]
      },
      {
        "ch": "कविता के बहाने (कुँवर नारायण)",
        "topics": [
          "पाठ्यपुस्तक: आरोह भाग 2 - निबंध"
        ]
      },
      {
        "ch": "अपठित गद्यांश और पद्यांश",
        "topics": [
          "पाठ्यपुस्तक: आरोह भाग 2 - अपठित"
        ]
      },
      {
        "ch": "व्याकरण: संप्रेषण और लेखन कौशल",
        "topics": [
          "पत्र लेखन, निबंध लेखन, संपादकीय"
        ]
      },
      {
        "ch": "व्याकरण: भाषा की शैली और विविधता",
        "topics": [
          "शब्द निर्माण, अर्थ विविधता"
        ]
      }
    ],
    "Basic Computer": [
      {
        "ch": "Object Oriented Programming in Python",
        "topics": [
          "Classes and Objects",
          "Constructor",
          "Inheritance",
          "Polymorphism",
          "Encapsulation",
          "File Handling",
          "Exception Handling"
        ]
      },
      {
        "ch": "Advanced Programming Concepts",
        "topics": [
          "Stacks and Queues using Lists",
          "Searching: Linear and Binary",
          "Sorting: Bubble, Selection, Insertion",
          "Time Complexity"
        ]
      },
      {
        "ch": "Database Management and SQL",
        "topics": [
          "Database Concepts",
          "MySQL: Data Types, Constraints, Joins, Subqueries, Views, Functions",
          "Python-MySQL Connectivity using mysql-connector"
        ]
      },
      {
        "ch": "Computer Networks",
        "topics": [
          "Network Types",
          "Topologies",
          "Protocols (TCP/IP, HTTP, FTP)",
          "Network Devices",
          "Network Security",
          "Cloud Computing",
          "IoT"
        ]
      },
      {
        "ch": "Society, Law and Ethics",
        "topics": [
          "Cyber Ethics",
          "Intellectual Property",
          "Privacy",
          "Digital Footprint",
          "Cyber Crime",
          "E-waste",
          "Information Security",
          "Career in IT"
        ]
      },
      {
        "ch": "Python - Object Oriented Programming",
        "topics": [
          "Classes and objects",
          "Constructor (__init__)",
          "Instance variables and methods",
          "Inheritance: single, multiple, multilevel",
          "Polymorphism",
          "Method overriding",
          "Encapsulation",
          "Operator overloading",
          "Abstract classes"
        ]
      },
      {
        "ch": "Python - File Handling and Data Structures",
        "topics": [
          "Text file operations",
          "Binary files with pickle",
          "CSV file handling",
          "Data structures: Stack (push, pop)",
          "Queue (enqueue, dequeue)",
          "Implementation using classes",
          "Linked list basics"
        ]
      },
      {
        "ch": "Database Management - Advanced SQL",
        "topics": [
          "MySQL advanced queries",
          "Subqueries",
          "Views",
          "Functions and stored procedures",
          "Triggers",
          "Transactions",
          "Database normalization",
          "Python-MySQL: CRUD operations",
          "Error handling in database operations"
        ]
      },
      {
        "ch": "Computer Networks and Security",
        "topics": [
          "Network types and topologies",
          "OSI model overview",
          "TCP/IP protocol suite",
          "Network devices in detail",
          "Network security: firewalls, encryption, VPN",
          "Cyber threats and prevention",
          "Cloud computing models",
          "IoT architecture"
        ]
      },
      {
        "ch": "Society, Law and Ethics - Advanced",
        "topics": [
          "Cyber ethics and professional responsibility",
          "IPR: copyright, patents, trademarks",
          "Privacy laws: GDPR, IT Act 2000",
          "Digital signatures and certificates",
          "E-governance",
          "Green computing",
          "Career paths in computing"
        ]
      },
      {
        "ch": "Data Science and Analytics",
        "topics": [
          "Data collection and preprocessing",
          "Exploratory data analysis",
          "Statistical methods",
          "Data visualization with matplotlib and seaborn",
          "Introduction to machine learning with scikit-learn",
          "Project work"
        ]
      },
      {
        "ch": "Web Application Development",
        "topics": [
          "Web frameworks (Flask/Django)",
          "MVC architecture",
          "Database-driven web apps",
          "User authentication",
          "REST API basics",
          "Frontend integration",
          "Deployment on cloud platforms"
        ]
      },
      {
        "ch": "Capstone Project",
        "topics": [
          "Project planning and design",
          "Requirement analysis",
          "Implementation using Python and SQL",
          "Testing and debugging",
          "Documentation",
          "Presentation and demonstration"
        ]
      }
    ]
  }
} as const satisfies CurriculumData;

const curriculumChapterOverrides: Partial<Record<number, Partial<Record<string, CurriculumChapter[]>>>> = {
  6: {
    English: literatureChapters("Poorvi", [
      "A Bottle of Dew",
      "The Raven and the Fox",
      "Rama to the Rescue",
      "The Unlikely Best Friends",
      "A Friend's Prayer",
      "The Chair",
      "Neem Baba",
      "What a Bird Thought",
      "Spices that Heal Us",
      "Change of Heart",
      "The Winner",
      "Yoga - A Way of Life",
      "Hamara Bharat - Incredible India!",
      "The Kites",
      "Ila Sachani: Embroidering Dreams with her Feet",
      "National War Memorial",
    ]),
  },
  7: {
    Mathematics: mathematicsChapters("Ganita Prakash", [
      "Part I - Large Numbers Around Us",
      "Part I - Arithmetic Expressions",
      "Part I - A Peek Beyond the Point",
      "Part I - Expressions using Letter-Numbers",
      "Part I - Parallel and Intersecting Lines",
      "Part I - Number Play",
      "Part I - A Tale of Three Intersecting Lines",
      "Part I - Working with Fractions",
      "Part II - Geometric Twins",
      "Part II - Operations with Integers",
      "Part II - Finding Common Ground",
      "Part II - Another Peek Beyond the Point",
      "Part II - Connecting the Dots",
      "Part II - Constructions and Tilings",
      "Part II - Finding the Unknown",
    ]),
    English: literatureChapters("Poorvi", [
      "The Day the River Spoke",
      "Try Again",
      "Three Days to See",
      "Animals, Birds, and Dr. Dolittle",
      "A Funny Man",
      "Say the Right Thing",
      "My Brother's Great Invention",
      "Paper Boats",
      "North, South, East, West",
      "The Tunnel",
      "Travel",
      "Conquering the Summit",
      "A Homage to Our Brave Soldiers",
      "My Dear Soldiers",
      "Rani Abbakka",
    ]),
  },
  8: {
    Mathematics: mathematicsChapters("Ganita Prakash", [
      "Part I - A Square and A Cube",
      "Part I - Power Play",
      "Part I - A Story of Numbers",
      "Part I - Quadrilaterals",
      "Part I - Number Play",
      "Part I - We Distribute, Yet Things Multiply",
      "Part I - Proportional Reasoning-1",
      "Part II - Fractions in Disguise",
      "Part II - The Baudhayana-Pythagoras Theorem",
      "Part II - Proportional Reasoning-2",
      "Part II - Exploring Some Geometric Themes",
      "Part II - Tales by Dots and Lines",
      "Part II - Algebra Play",
      "Part II - Area",
    ]),
    English: literatureChapters("Poorvi", [
      "The Wit that Won Hearts",
      "A Concrete Example",
      "Wisdom Paves the Way",
      "A Tale of Valour: Major Somnath Sharma and the Battle of Badgam",
      "Somebody's Mother",
      "Verghese Kurien - I Too Had A Dream",
      "The Case of the Fifth Word",
      "The Magic Brush of Dreams",
      "Spectacular Wonders",
      "The Cherry Tree",
      "Harvest Hymn",
      "Waiting for the Rain",
      "Feathered Friend",
      "Magnifying Glass",
      "Bibha Chowdhuri: The Beam of Light that Lit the Path for Women in Indian Science",
    ]),
  },
  9: {
    English: literatureChapters("Kaveri", [
      "How I Taught My Grandmother to Read",
      "Bharat Our Land",
      "The Pot Maker",
      "Gifts of Grace: Honouring Our Vocations",
      "Winds of Change",
      "Canvas of Soil",
      "Vitamin-M",
      "I Cannot Remember My Mother",
      "The World of Limitless Possibilities",
      "Nine Gold Medals",
      "Twin Melodies",
      "A Friend Found in Music",
      "Carrier of Words",
      "Words",
      "Follow That Dream",
      "Believe in Yourself",
    ]),
  },
};

const subjectIcons: Record<string, string> = {
  Mathematics: "🧮",
  Science: "🔬",
  Physics: "⚛️",
  Chemistry: "🧪",
  Biology: "🧬",
  History: "📜",
  Geography: "🌍",
  Civics: "🏛️",
  Economics: "📈",
  English: "📖",
  Hindi: "✍️",
  "Basic Computer": "💻",
  "Advanced Computer": "🖥️",
};

const displaySubjectIcons: Record<string, string> = {
  Mathematics: "🧮",
  Science: "🔬",
  Physics: "⚛️",
  Chemistry: "🧪",
  Biology: "🧬",
  History: "📜",
  Geography: "🌍",
  Civics: "🏛️",
  Economics: "📈",
  English: "📖",
  Hindi: "✍️",
  "Basic Computer": "💻",
  "Advanced Computer": "🖥️",
  "Computer IT": "💻",
  "Social Science": "🌐",
};

export function subjectIconForName(name: string) {
  return displaySubjectIcons[name] ?? subjectIcons[name] ?? shortSubjectIcon(name);
}

export function getCurriculumSubjects() {
  const classesBySubject = new Map<string, Set<number>>();

  Object.entries(curriculumData).forEach(([classNum, subjects]) => {
    Object.keys(subjects).forEach((subject) => {
      const classes = classesBySubject.get(subject) ?? new Set<number>();
      classes.add(Number(classNum));
      classesBySubject.set(subject, classes);
    });
  });

  Object.entries(curriculumChapterOverrides).forEach(([classNum, subjects]) => {
    Object.keys(subjects ?? {}).forEach((subject) => {
      const classes = classesBySubject.get(subject) ?? new Set<number>();
      classes.add(Number(classNum));
      classesBySubject.set(subject, classes);
    });
  });

  return Array.from(classesBySubject.entries())
    .map(([name, subjectClasses]) => ({
      name,
      icon: subjectIconForName(name),
      classes: visibleSubjectClasses(name, subjectClasses),
    }))
    .filter((subject) => subject.classes.length > 0)
    .sort((left, right) => subjectOrder(left.name) - subjectOrder(right.name));
}

function visibleSubjectClasses(subject: string, classes: Set<number>) {
  const hiddenIntegratedScienceClasses = new Set([9, 10, 11, 12]);

  return Array.from(classes)
    .filter(
      (classNum) =>
        subject !== "Science" || !hiddenIntegratedScienceClasses.has(classNum),
    )
    .sort((left, right) => left - right);
}

export function getCurriculumChapters(classNum: number, subject: string): ChapterOption[] {
  const curriculumByClass = curriculumData as CurriculumData;
  const chapters =
    curriculumChapterOverrides[classNum]?.[subject] ?? curriculumByClass[classNum]?.[subject] ?? [];
  const baseId = curriculumBaseId(classNum, subject);

  return chapters.map((chapter: CurriculumChapter, chapterIndex: number) => {
    const id = baseId + chapterIndex + 1;

    return {
      id,
      name: chapter.ch,
      status: "CURRICULUM_READY",
      difficultyScore: 0.42 + (chapterIndex % 4) * 0.08,
      topics: chapter.topics.map((topic: string, topicIndex: number) => ({
        id: id * 100 + topicIndex + 1,
        name: topic,
        importance: topicIndex === 0 ? "HIGH" : "MEDIUM",
      })),
    };
  });
}

export function getCurriculumChapter(classNum: number, subject: string, chapterId: number) {
  return getCurriculumChapters(classNum, subject).find((chapter) => chapter.id === chapterId);
}

export function getCurriculumConceptsForChapters(
  classNum: number,
  subjects: string[],
  chapterIds: number[],
): ConceptData[] {
  const concepts: ConceptData[] = [];

  chapterIds.forEach((chapterId) => {
    const subject = subjectForChapterId(classNum, subjects, chapterId);
    if (!subject) return;
    concepts.push(...getCurriculumConceptsForChapter(classNum, subject, chapterId));
  });

  return concepts;
}

export function getCurriculumConceptsForChapter(
  classNum: number,
  subject: string,
  chapterId: number,
): ConceptData[] {
  const chapter = getCurriculumChapter(classNum, subject, chapterId);
  if (!chapter) return [];

  return chapter.topics.map((topic, index) => ({
    text: curriculumConceptText(classNum, subject, chapter.name, topic.name),
    type: conceptTypeForSubject(subject, index),
    bloomLevel: index === 0 ? "APPLY" : "UNDERSTAND",
    hotsPotential: index === 0 || highOrderSubject(subject),
    hotsPoential: index === 0 || highOrderSubject(subject),
    subject,
    classNum,
    chapterName: chapter.name,
    topicName: topic.name,
    topicId: topic.id,
    chapterId,
    source: "curriculum",
  }));
}

function subjectForChapterId(classNum: number, subjects: string[], chapterId: number) {
  return subjects.find((subject) => getCurriculumChapter(classNum, subject, chapterId));
}

function literatureChapters(bookTitle: string, chapterNames: string[]): CurriculumChapter[] {
  return chapterNames.map((chapterName) => ({
    ch: chapterName,
    topics: [
      `${bookTitle}: ${chapterName}`,
      "Reading comprehension and inference",
      "Vocabulary and grammar in context",
      "Theme, character, tone, and literary devices",
    ],
  }));
}

function mathematicsChapters(bookTitle: string, chapterNames: string[]): CurriculumChapter[] {
  return chapterNames.map((chapterName) => ({
    ch: chapterName,
    topics: [
      `${bookTitle}: ${chapterName}`,
      "Core concepts and definitions",
      "Textbook examples and exercises",
      "Problem solving and application",
    ],
  }));
}

function curriculumConceptText(
  classNum: number,
  subject: string,
  chapterName: string,
  topicName: string,
) {
  return (
    'Class ' +
    classNum +
    ' ' +
    subject +
    ' chapter "' +
    chapterName +
    '" includes the NCERT/CBSE topic "' +
    topicName +
    '". Generate questions only from this selected chapter-topic pair, using textbook vocabulary, examples, exercises, definitions, formulas, maps, activities, employability skills, or computer-practical context where relevant.'
  );
}

function conceptTypeForSubject(subject: string, index: number) {
  if (/Mathematics|Physics|Chemistry|Computer/i.test(subject)) {
    return index === 0 ? "FORMULA" : "APPLICATION";
  }
  if (/Biology|Science/i.test(subject)) return index === 0 ? "DEFINITION" : "FACT";
  if (/English|Hindi/i.test(subject)) return "EXAMPLE";
  return index === 0 ? "FACT" : "APPLICATION";
}

function highOrderSubject(subject: string) {
  return /Mathematics|Physics|Chemistry|Biology|History|Geography|Civics|Economics|Computer/i.test(subject);
}

function curriculumBaseId(classNum: number, subject: string) {
  return classNum * 100000 + subjectOrder(subject) * 10000;
}

function shortSubjectIcon(subject: string) {
  return (
    subject
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 4) || "Book"
  );
}

function subjectOrder(subject: string) {
  const order = [
    "Mathematics",
    "Science",
    "Physics",
    "Chemistry",
    "Biology",
    "History",
    "Geography",
    "Civics",
    "Economics",
    "English",
    "Hindi",
    "Basic Computer",
    "Advanced Computer",
  ];
  const index = order.indexOf(subject);
  return index === -1 ? order.length + 1 : index + 1;
}

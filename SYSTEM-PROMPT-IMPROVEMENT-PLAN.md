# System Prompt Improvement Plan - Reference Document

## **Executive Summary**
This document outlines the comprehensive plan to improve system prompts in the real estate campaign generation system, focusing on clarity, reliability, and reduced complexity.

---

## **Core Issues Identified**

### **1. Prompt Complexity**
- Current prompts exceed 1000+ characters
- Multiple competing instructions within single prompts
- LLM cognitive overload leading to degraded performance

### **2. Priority Conflicts**
- **RESOLVED**: Unit type campaigns now have clear hierarchy
- Conflicting "MUST" vs "SHOULD" instructions eliminated
- Character counting reliability issues

### **3. Technical Reliability**
- JSON extraction fragility
- Google Maps API over-dependency
- Character validation post-processing issues

---

## **Revised Campaign Priority Hierarchies**

### **UNIT TYPE CAMPAIGNS** ✅
```
Priority 1 (REQUIRED): Include unit type in EVERY headline
- Examples: "Studio", "1-Bedroom", "2-Bedroom", "3-Bedroom"
Priority 2: Include amenities as character space allows
Community Name: OPTIONAL (not required)
```

### **PROXIMITY CAMPAIGNS**
```
Priority 1: Include specific place names from Google Maps
Priority 2: Focus on convenience/accessibility benefits  
Community Name: NOT USED (pure location focus)
```

### **GENERAL LOCATION CAMPAIGNS**
```
Priority 1: Community name in 40% of headlines (6/15)
Priority 2: Amenities in 60% of headlines (9/15)
Priority 3: Balance branding with features
```

---

## **Implementation Phases**

### **Phase 1: Core Restructuring** (Week 1-2)
- [x] Remove character counting from prompts
- [x] Simplify unit type requirements (unit type required, community optional)
- [x] Reduce proximity campaign from 8 to 3 steps
- [x] Standardize JSON output requirements

### **Phase 2: Template Creation** (Week 3-4)
- [ ] Create modular prompt components
- [ ] Implement staged correction approach
- [ ] Reduce prompt lengths to 600-700 chars
- [ ] Add specific headline distribution rules

### **Phase 3: Optimization** (Week 5-6)
- [ ] Fine-tune campaign modules
- [ ] Optimize Google Maps integration
- [ ] Create comprehensive fallbacks
- [ ] Performance testing

---

## **New Prompt Template Structure**

### **Base Template**
```
🎯 CAMPAIGN: [Type] - [Location]
📝 REQUIREMENTS: 15 headlines (~25 chars), 4 descriptions (~75 chars)
🎨 FOCUS: [Campaign-specific priority]
📊 OUTPUT: JSON only
```

### **Character Strategy**
- **Remove**: All character counting instructions from prompts
- **Use**: Range-based targets ("about 25 characters")
- **Rely on**: Post-generation validation entirely

---

## **Campaign-Specific Improvements**

### **Unit Type Campaigns**
```
✅ SIMPLIFIED REQUIREMENTS:
- Every headline MUST contain unit type
- Community name is optional
- Amenities as space allows
- NO conflicting priorities
```

### **Proximity Campaigns**
```
✅ STREAMLINED PROCESS:
Step 1: Get Google Maps data (3 location types)
Step 2: Create headlines with place names
Step 3: Focus on convenience benefits
```

### **General Location Campaigns**
```
✅ CLEAR DISTRIBUTION:
- 9 amenity-focused headlines
- 6 community-branded headlines
- Clear 60/40 split
```

---

## **Technical Improvements**

### **JSON Reliability**
- Consistent schema across campaigns
- Explicit validation requirements
- Better error recovery

### **Correction Strategy**
- Stage 1: Fix headline lengths only
- Stage 2: Fix description lengths only  
- Stage 3: Fix content issues if needed

### **Validation Metrics**
- Target: 90%+ character validation accuracy
- Target: <5% JSON parsing failures
- Target: 85%+ correction success rate

---

## **Key Decisions Made**

### **Unit Type Campaign Clarity** ✅
- **DECISION**: Unit type required in every headline
- **DECISION**: Community name optional (removes conflict)
- **RATIONALE**: Eliminates priority conflicts, increases targeting precision

### **Character Count Strategy** ✅
- **DECISION**: Remove all character counting from prompts
- **DECISION**: Use descriptive ranges instead of exact counts
- **RATIONALE**: LLMs cannot reliably count characters

### **Proximity Campaign Simplification** ✅
- **DECISION**: Reduce from 8 steps to 3 steps
- **DECISION**: Remove complex categorization
- **RATIONALE**: Over-engineering leads to failures

---

## **Success Metrics Dashboard**

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Prompt Length | 1000+ chars | 600-700 chars | 🔄 In Progress |
| Character Validation | ~70% | 90%+ | 🔄 In Progress |
| JSON Parse Success | ~85% | 95%+ | 🔄 In Progress |
| Unit Type Compliance | Variable | 100% | ✅ Defined |
| Correction Success | ~60% | 85%+ | 🔄 In Progress |

---

## **Next Actions**

### **Immediate (This Week)**
1. Update unit type campaign prompts to remove community name requirement
2. Implement 3-step proximity campaign process
3. Remove line 1178 character count instruction

### **Short Term (Next 2 Weeks)**  
1. Create modular prompt templates
2. Implement staged correction system
3. Test prompt length reductions

### **Medium Term (Next Month)**
1. Full system performance testing
2. Metrics validation
3. Documentation updates

---

## **Reference Links**
- Original Analysis: [System Prompt Assessment]
- Implementation Code: `campaign-service/src/app/api/campaigns/real-estate/generate/route.ts`
- Validation Classes: `AdCopyValidator`, `EnhancedPromptGenerator`

---

*Last Updated: [Current Date]*
*Status: Implementation Phase 1 - Core Restructuring* 